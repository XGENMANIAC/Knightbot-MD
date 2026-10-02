# Med Control Group Sender

This branch is intentionally single-purpose.

It sends:
1. One group announcement to the WhatsApp group whose subject is exactly `Doc’s Den 1.1🌟`.
2. One private Med invitation to each of exactly 9 configured testers.
3. Nothing else.

It does not run the old Knightbot commands, respond to messages, moderate groups, tag users, or act as a general WhatsApp bot.

## Privacy

Do not commit tester phone numbers or activation codes. Supply them through `TESTERS_JSON` in the runtime environment.

Expected shape:

```json
[
  {"name":"Name","phone":"+2547XXXXXXXX","code":"activation-code"}
]
```

The sender refuses to run unless exactly 9 recipients are provided.

## Safety against accidental broadcasts

- The group name is hard-coded to `Doc’s Den 1.1🌟`.
- The script refuses to send if zero or multiple groups match that exact name.
- `SEND_NOW=true` is required for a real send.
- A local completion marker prevents repeat sends on the same persistent filesystem.
- The process exits as soon as the one-shot send finishes.

## Run

```bash
npm install
SEND_NOW=false TESTERS_JSON='[...]' npm start
```

Use the dry run first. Once it validates the exact group and 9 recipients, rerun with `SEND_NOW=true`.

WhatsApp authentication uses the existing `./session` directory. If no valid session exists, the Baileys QR will be shown in the terminal.
