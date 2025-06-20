/*Créditos A Quien Correspondan 
Play Traido y Editado 
Por Cuervo-Team-Supreme*/
const axios = require('axios');
const yts = require('yt-search');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function songCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const searchQuery = text.split(' ').slice(1).join(' ').trim();
        
        if (!searchQuery) {
            return await sock.sendMessage(chatId, { 
                text: "What song do you want to download?"
            });
        }

        // Search for the song
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "No songs found!"
            });
        }

        // Get the first video result
        const video = videos[0];
        const urlYt = video.url;

        // Prepare temp files
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }
        const tempFile = path.join(tempDir, `${Date.now()}.mp3`);
        const tempM4a = path.join(tempDir, `${Date.now()}.m4a`);

        try {
            // Send the thumbnail and info immediately after getting video info
            if (video.thumbnail) {
                try {
                    await sock.sendMessage(chatId, {
                        image: { url: video.thumbnail },
                        caption: `*${video.title}*\n\n*Duration:* ${formatDuration(video.duration.seconds)}\n*Views:* ${formatNumber(video.views)}\n\n> *_Downloaded by Knight Bot MD_*`
                    }, { quoted: message });
                } catch (thumbErr) {
                }
            }

            // Try multiple APIs with fallback
            const apis = [
                {
                    name: 'xploader',
                    url: `https://xploader-api.vercel.app/ytmp3?url=${encodeURIComponent(urlYt)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                },
                {
                    name: 'davidcyril',
                    url: `https://apis.davidcyriltech.my.id/youtube/mp3?url=${encodeURIComponent(urlYt)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                },
                {
                    name: 'ryzendesu',
                    url: `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(urlYt)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                },
                {
                    name: 'dreaded',
                    url: `https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(urlYt)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                },
                {
                    name: 'siputzx',
                    url: `https://api.siputzx.my.id/api/dl/youtube/mp3?url=${encodeURIComponent(urlYt)}`,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                }
            ];

            let downloadUrl = null;
            let workingApi = null;

            for (const api of apis) {
                try {
                    
                    // Add delay between API calls to avoid rate limiting
                    if (workingApi === null && api.name !== 'xploader') {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    const response = await fetch(api.url, { headers: api.headers });
                    
                    if (!response.ok) {
                        continue;
                    }
                    
                    const responseText = await response.text();
                    
                    // Check if response is HTML (error page)
                    if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<html')) {
                        continue;
                    }
                    
                    let data;
                    try {
                        data = JSON.parse(responseText);
                    } catch (e) {
                        continue;
                    }
                    
                    // Check different API response formats
                    if (data && (data.status === 200 || data.success || data.status === true)) {
                        let videoUrl = null;
                        
                        // Handle different response structures
                        if (data.result && data.result.downloadUrl) {
                            videoUrl = data.result.downloadUrl;
                        } else if (data.result && data.result.download && data.result.download.url) {
                            videoUrl = data.result.download.url;
                        } else if (data.url) {
                            videoUrl = data.url;
                        } else if (data.data) {
                            videoUrl = data.data;
                        }
                        
                        if (videoUrl) {
                            downloadUrl = videoUrl;
                            workingApi = api.name;
                            break;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }

            if (!downloadUrl || !workingApi) {
                await sock.sendMessage(chatId, {
                    text: 'Sorry, all song download APIs are currently unavailable. Please try again later.'
                }, { quoted: message });
                return;
            }

            // Download and convert the audio
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                await sock.sendMessage(chatId, { text: 'Failed to download the song file from the server.' }, { quoted: message });
                return;
            }
            
            const buffer = await response.buffer();
            if (!buffer || buffer.length < 1024) {
                await sock.sendMessage(chatId, { text: 'Downloaded file is empty or too small.' }, { quoted: message });
                return;
            }
            
            fs.writeFileSync(tempM4a, buffer);
            
            // Convert to MP3 with proper WhatsApp-compatible settings
            await execPromise(`ffmpeg -i "${tempM4a}" -vn -acodec libmp3lame -ac 2 -ab 128k -ar 44100 "${tempFile}"`);
            
            const stats = fs.statSync(tempFile);
            if (stats.size < 1024) {
                throw new Error('Conversion failed');
            }
            
            await sock.sendMessage(chatId, {
                audio: { url: tempFile },
                mimetype: "audio/mpeg",
                fileName: `${video.title}.mp3`,
                ptt: false
            }, { quoted: message });
            
            // Clean up temp files
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    if (fs.existsSync(tempM4a)) fs.unlinkSync(tempM4a);
                } catch {}
            }, 5000);
            
            return;
        } catch (error) {
            console.log('🎵 Song Command Error:', error.message);
            await sock.sendMessage(chatId, { 
                text: "Download failed. Please try again later."
            }, { quoted: message });
        }
    } catch (error) {
        console.log('🎵 Song Command Error:', error.message);
        await sock.sendMessage(chatId, { 
            text: "Download failed. Please try again later."
        }, { quoted: message });
    }
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = songCommand; 