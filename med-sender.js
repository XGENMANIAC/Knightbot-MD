require('dotenv').config();

const fs = require('fs');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  delay,
} = require('@whiskeysockets/baileys');

const TARGET_GROUP_NAME = 'Doc’s Den 1.1🌟';
const EXPECTED_PRIVATE_RECIPIENTS = 9;
const SESSION_DIR = process.env.SESSION_DIR || './session';
const SENT_MARKER = './med-control-sent.json';
const SEND_NOW = String(process.env.SEND_NOW || '').toLowerCase() === 'true';

const GROUP_MESSAGE = `Hey guys 👋🏽🩺

I’m one of the representatives from the Premium Scholars team spearheading Med, and this group has been selected as one of the first control groups to test the platform before access is expanded to more students.

Med is being developed as a medical-student study platform, starting with the UoN MBChB curriculum. The aim is to bring notes, lecture materials, histology resources, revision tools and other useful academic resources into one organised platform.

🌐 Control Group Registration:
https://medcurve-web-1efc0ef.azurewebsites.net/control-group?mode=signup

🔐 IMPORTANT:
Each person has been assigned a personal invitation/activation code.

I’ll send your code to you privately. Please don't share your code because it is specifically assigned to your tester account.

To register:

1️⃣ Open the link above.
2️⃣ Enter your phone number.
3️⃣ Enter the activation code I send you privately.
4️⃣ Create your own password.
5️⃣ Afterwards, you'll log in using your phone number + password.

Once you're inside, please actually use the platform as you would while studying.

We're particularly looking for:

🐛 Bugs or broken pages
📱 Problems on phones, tablets or laptops
🔎 Search/navigation issues
📚 Missing or incorrectly organised materials
⚡ Slow-loading sections
🔐 Sign-up/login problems
💡 Features or resources you think should be added
🤔 Anything confusing or unnecessary

If something goes wrong, please take a screenshot and tell us what you were doing when the problem occurred.

And don't sugarcoat the feedback 😂. The whole point of a control group is to find what needs improvement before a larger rollout.

You guys are basically among the first students to test Med 🚀🩺

Premium Scholars × Med`;

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseTesters() {
  let raw = process.env.TESTERS_JSON;

  if (!raw) {
    const testersFile = process.env.TESTERS_FILE || './testers.json';
    if (fs.existsSync(testersFile)) {
      raw = fs.readFileSync(testersFile, 'utf8');
      console.log(`Loaded tester configuration from ${testersFile}`);
    }
  }

  if (!raw) {
    throw new Error(
      'Tester configuration missing. Create ./testers.json or set TESTERS_JSON in .env. Keep phone numbers and activation codes out of GitHub.'
    );
  }

  let testers;
  try {
    testers = JSON.parse(raw);
  } catch {
    throw new Error('Tester configuration is not valid JSON.');
  }

  if (!Array.isArray(testers) || testers.length !== EXPECTED_PRIVATE_RECIPIENTS) {
    throw new Error(`Refusing to send: expected exactly ${EXPECTED_PRIVATE_RECIPIENTS} private recipients.`);
  }

  for (const tester of testers) {
    if (!tester.name || !tester.phone || !tester.code) {
      throw new Error('Each tester needs name, phone and code.');
    }
    const phone = cleanPhone(tester.phone);
    if (phone.length < 8 || phone.length > 15) {
      throw new Error(`Invalid phone number supplied for ${tester.name}.`);
    }
  }

  return testers;
}

function privateMessage(tester) {
  return `Hey ${tester.name} 👋🏽

Here are your personal Med control-group access details.

🌐 Registration:
https://medcurve-web-1efc0ef.azurewebsites.net/control-group?mode=signup

📱 Phone: ${tester.phone}

🔑 Personal activation code:
${tester.code}

Enter the activation code during registration and then create your own password.

Please don't share the activation code since it is assigned specifically to your tester account.

If anything breaks or behaves strangely, take a screenshot and send it through 🩺🚀`;
}

function alreadySent() {
  if (!fs.existsSync(SENT_MARKER)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(SENT_MARKER, 'utf8'));
    return state.completed === true;
  } catch {
    return false;
  }
}

function markSent(groupJid, count) {
  fs.writeFileSync(
    SENT_MARKER,
    JSON.stringify(
      {
        completed: true,
        sentAt: new Date().toISOString(),
        groupName: TARGET_GROUP_NAME,
        groupJid,
        privateRecipients: count,
      },
      null,
      2
    )
  );
}

async function sendEverything(sock) {
  const testers = parseTesters();

  if (alreadySent()) {
    console.log('This Med control-group send has already completed. Nothing was sent.');
    return;
  }

  const groups = await sock.groupFetchAllParticipating();
  const matches = Object.values(groups).filter(
    (group) => group && group.subject === TARGET_GROUP_NAME
  );

  if (matches.length !== 1) {
    throw new Error(
      `Refusing to send: expected exactly one WhatsApp group named "${TARGET_GROUP_NAME}", found ${matches.length}.`
    );
  }

  const targetGroup = matches[0];

  if (!SEND_NOW) {
    console.log('DRY RUN ONLY — SEND_NOW is not true.');
    console.log(`Validated target group: ${targetGroup.subject} (${targetGroup.id})`);
    console.log(`Validated private recipients: ${testers.length}`);
    return;
  }

  console.log(`Sending group announcement only to: ${targetGroup.subject}`);
  await sock.sendMessage(targetGroup.id, { text: GROUP_MESSAGE });

  for (const tester of testers) {
    const phone = cleanPhone(tester.phone);
    const jid = `${phone}@s.whatsapp.net`;

    const exists = await sock.onWhatsApp(phone);
    if (!exists?.[0]?.exists) {
      throw new Error(`WhatsApp account not found for ${tester.name} (${tester.phone}). Stopping before any further private sends.`);
    }

    await delay(1500);
    await sock.sendMessage(jid, { text: privateMessage(tester) });
    console.log(`Private message sent to ${tester.name}.`);
  }

  markSent(targetGroup.id, testers.length);
  console.log('Med control-group announcement and all private invitations sent successfully.');
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    browser: ['Med Control Sender', 'Chrome', '1.0.0'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
    },
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  let running = false;

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nScan this QR in WhatsApp → Linked devices → Link a device:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open' && !running) {
      running = true;
      try {
        await delay(2500);
        await sendEverything(sock);
        await delay(1000);
        sock.end(undefined);
        process.exit(0);
      } catch (error) {
        console.error(error?.stack || error);
        sock.end(undefined);
        process.exit(1);
      }
    }

    if (connection === 'close' && !running) {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(start, 2000);
      } else {
        console.error('WhatsApp session is logged out. Pair the sender again.');
        process.exit(1);
      }
    }
  });
}

start().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
