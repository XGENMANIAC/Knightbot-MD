async function isAdmin(sock, chatId, senderId) {
    const groupMetadata = await sock.groupMetadata(chatId);
    
    const botId = sock.user.id;
    const botNumber = botId.split(':')[0];
    
    const participant = groupMetadata.participants.find(p => 
        p.id === senderId || 
        p.id === senderId.replace('@s.whatsapp.net', '@lid') ||
        p.id === senderId.replace('@lid', '@s.whatsapp.net')
    );
    
    const bot = groupMetadata.participants.find(p => 
        p.admin === 'superadmin' || 
        (p.id === botNumber + '@s.whatsapp.net' && p.admin === 'admin')
    );
    
    
    const isBotAdmin = bot && (bot.admin === 'admin' || bot.admin === 'superadmin');
    const isSenderAdmin = participant && (participant.admin === 'admin' || participant.admin === 'superadmin');


    return { isSenderAdmin, isBotAdmin };
}

module.exports = isAdmin;
