const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const { execFile } = require("child_process");
const config = require("./config");

const bot = new Telegraf(config.BOT_TOKEN);

/* ================= DATABASE ================= */

const DB_FILE = "./data.json";

let db = {
  users: {},
  totalVideos: 0
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf8");

      if (data.trim()) {
        db = JSON.parse(data);
      }
    }
  } catch (err) {
    console.log("Database load error:", err.message);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (err) {
    console.log("Database save error:", err.message);
  }
}

loadDB();

/* ================= MEMORY ================= */

const users = new Map();
const userVideos = new Map();
const boardchatAdmin = new Set();

/* ================= ADMIN ================= */

function isAdmin(ctx) {
  return String(ctx.from.id) === String(config.ADMIN_ID);
}

/* ========================================================= */
/* ===================== TIKTOK API ======================== */
/* ========================================================= */

async function getTikTokVideo(url) {
  try {
    const api =
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;

    const res = await axios.get(api, {
      timeout: 30000
    });

    if (res?.data?.data?.play) {
      return {
        video: res.data.data.play,
        audio: res.data.data.music,
        type: "tiktok"
      };
    }

    return null;
  } catch (err) {
    console.log(
      "TikTok Download error:",
      err.message
    );

    return null;
  }
}

/* ========================================================= */
/* ===================== YT-DLP HELPER ===================== */
/* ========================================================= */

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      args,
      {
        timeout: 120000,
        maxBuffer: 20 * 1024 * 1024
      },
      (error, stdout, stderr) => {

        if (error) {
          console.log(
            "yt-dlp error:",
            stderr || error.message
          );

          return reject(
            new Error(
              stderr || error.message
            )
          );
        }

        resolve(stdout.trim());
      }
    );
  });
}

/* ========================================================= */
/* ================= FACEBOOK VIDEO ======================== */
/* ========================================================= */

async function getFacebookVideo(url) {
  try {

    console.log(
      "Facebook URL:",
      url
    );

    /*
      First get direct media URL.
      -f best = best available video
      -g = print direct URL
    */

    const directUrl =
      await runYtDlp([
        "--no-warnings",
        "--no-playlist",
        "-f",
        "best",
        "-g",
        url
      ]);

    if (!directUrl) {
      return null;
    }

    /*
      yt-dlp can sometimes return multiple
      URLs. Use the first one.
    */

    const videoUrl =
      directUrl
        .split(/\r?\n/)
        .find(line => line.trim());

    if (!videoUrl) {
      return null;
    }

    return {
      video: videoUrl.trim(),
      type: "facebook",
      originalUrl: url
    };

  } catch (err) {

    console.log(
      "Facebook Download error:",
      err.message
    );

    return null;
  }
}

/* ========================================================= */
/* ================= FACEBOOK MP3 ========================== */
/* ========================================================= */

async function getFacebookAudio(url) {
  try {

    console.log(
      "Facebook MP3 URL:",
      url
    );

    /*
      yt-dlp extracts the best audio stream.
      ffmpeg is required for MP3 conversion.
    */

    const audioUrl =
      await runYtDlp([
        "--no-warnings",
        "--no-playlist",
        "-f",
        "bestaudio/best",
        "-x",
        "--audio-format",
        "mp3",
        "--get-url",
        url
      ]);

    if (!audioUrl) {
      return null;
    }

    const directAudioUrl =
      audioUrl
        .split(/\r?\n/)
        .find(line => line.trim());

    return directAudioUrl
      ? directAudioUrl.trim()
      : null;

  } catch (err) {

    console.log(
      "Facebook MP3 error:",
      err.message
    );

    return null;
  }
}

/* ========================================================= */
/* ========================= START ========================= */
/* ========================================================= */

bot.start(async (ctx) => {

  const id = ctx.from.id;
  const uid = String(id);

  if (!db.users[uid]) {

    db.users[uid] = {
      id: id,
      username:
        ctx.from.username || "",
      first_name:
        ctx.from.first_name || "",
      joined: false,
      videos: 0
    };

    saveDB();
  }

  if (
    db.users[uid].joined === true
  ) {

    users.set(
      id,
      "joined"
    );

    return ctx.reply(
`✅ Welcome!

🇧🇩 বাংলায়:
আপনি এখন বট ব্যবহার করতে পারবেন।
TikTok ভিডিও বা Facebook Reels ডাউনলোড করতে ভিডিও লিংক পাঠান 📥

🇬🇧 English:
You can now use the bot. Send a TikTok or Facebook Reels link to download video 📥`
    );
  }

  return ctx.reply(
    "👋 Welcome!\n\nPlease join our channels to use the bot:",
    Markup.inlineKeyboard([
      [
        Markup.button.url(
          "🌍 Global Channel",
          "https://t.me/Global_Method_Channel1"
        )
      ],
      [
        Markup.button.url(
          "📩 Support Owner",
          "https://t.me/Smart_Method_Owner"
        )
      ],
      [
        Markup.button.callback(
          "✅ I Joined",
          "joined_check"
        )
      ]
    ])
  );
});

/* ========================================================= */
/* ========================= JOIN ========================== */
/* ========================================================= */

bot.action(
  "joined_check",
  async (ctx) => {

    const id = ctx.from.id;
    const uid = String(id);

    if (!db.users[uid]) {

      db.users[uid] = {
        id: id,
        username:
          ctx.from.username || "",
        first_name:
          ctx.from.first_name || "",
        joined: true,
        videos: 0
      };

    } else {

      db.users[uid].joined =
        true;
    }

    users.set(
      id,
      "joined"
    );

    saveDB();

    await ctx.answerCbQuery();

    return ctx.reply(
`✅ Welcome!

🇧🇩 বাংলায়:
আপনি এখন বট ব্যবহার করতে পারবেন।
TikTok ভিডিও বা Facebook Reels ডাউনলোড করতে ভিডিও লিংক পাঠান 📥

🇬🇧 English:
You can now use the bot. Send a TikTok or Facebook Reels link to download video 📥`
    );
  }
);

/* ========================================================= */
/* ======================= DASHBOARD ======================= */
/* ========================================================= */

bot.command(
  "dashboard",
  async (ctx) => {

    if (!isAdmin(ctx)) {

      return ctx.reply(
`❌ Access Denied!

🇧🇩 বাংলা:
❌ আপনার Admin Access নেই।`
      );
    }

    const totalUsers =
      Object.keys(db.users).length;

    return ctx.reply(
`👑 ADMIN DASHBOARD

👥 Total Users: ${totalUsers}
📥 Total Videos: ${db.totalVideos}

🇧🇩 বাংলা:
👥 মোট ইউজার: ${totalUsers}
📥 মোট ভিডিও ডাউনলোড: ${db.totalVideos}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "👥 Total Users",
            "admin_users"
          )
        ],
        [
          Markup.button.callback(
            "📊 Video Download Stats",
            "admin_video_stats"
          )
        ],
        [
          Markup.button.callback(
            "📢 Boardchat",
            "admin_boardchat"
          )
        ],
        [
          Markup.button.callback(
            "🔄 Refresh Dashboard",
            "admin_dashboard"
          )
        ]
      ])
    );
  }
);

/* ================= REFRESH ================= */

bot.action(
  "admin_dashboard",
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        "❌ Access Denied!"
      );
    }

    await ctx.answerCbQuery();

    const totalUsers =
      Object.keys(db.users).length;

    return ctx.editMessageText(
`👑 ADMIN DASHBOARD

👥 Total Users: ${totalUsers}
📥 Total Videos: ${db.totalVideos}

🇧🇩 বাংলা:
👥 মোট ইউজার: ${totalUsers}
📥 মোট ভিডিও ডাউনলোড: ${db.totalVideos}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "👥 Total Users",
            "admin_users"
          )
        ],
        [
          Markup.button.callback(
            "📊 Video Download Stats",
            "admin_video_stats"
          )
        ],
        [
          Markup.button.callback(
            "📢 Boardchat",
            "admin_boardchat"
          )
        ],
        [
          Markup.button.callback(
            "🔄 Refresh Dashboard",
            "admin_dashboard"
          )
        ]
      ])
    );
  }
);

/* ========================================================= */
/* ====================== TOTAL USERS ====================== */
/* ========================================================= */

bot.action(
  "admin_users",
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        "❌ Access Denied!"
      );
    }

    await ctx.answerCbQuery();

    const totalUsers =
      Object.keys(db.users).length;

    let text =
`👥 TOTAL USERS

Total Users: ${totalUsers}

🇧🇩 বাংলা:
মোট ইউজার: ${totalUsers}

━━━━━━━━━━━━━━━━━━`;

    Object.values(db.users)
      .slice(-30)
      .reverse()
      .forEach((user, index) => {

        const username =
          user.username
            ? `@${user.username}`
            : "No Username";

        text +=
`\n\n${index + 1}. 👤 ${user.first_name || "User"}
🆔 ID: ${user.id}
📛 Username: ${username}
📥 Videos: ${user.videos || 0}`;
      });

    return ctx.reply(
      text,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🔙 Back",
            "admin_dashboard"
          )
        ]
      ])
    );
  }
);

/* ========================================================= */
/* ================= VIDEO STATISTICS ====================== */
/* ========================================================= */

bot.action(
  "admin_video_stats",
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        "❌ Access Denied!"
      );
    }

    await ctx.answerCbQuery();

    const usersList =
      Object.values(db.users)
        .filter(
          user =>
            (user.videos || 0) > 0
        )
        .sort(
          (a, b) =>
            (b.videos || 0) -
            (a.videos || 0)
        );

    let text =
`📊 VIDEO DOWNLOAD STATS

📥 Total Videos Downloaded: ${db.totalVideos}

🇧🇩 বাংলা:
📥 মোট ডাউনলোড: ${db.totalVideos}

━━━━━━━━━━━━━━━━━━`;

    if (
      usersList.length === 0
    ) {

      text +=
`\n\n❌ No video download data found!

🇧🇩 বাংলা:
❌ এখনো কোনো ভিডিও ডাউনলোডের তথ্য পাওয়া যায়নি।`;

    } else {

      usersList.forEach(
        (user, index) => {

          const username =
            user.username
              ? `@${user.username}`
              : "No Username";

          text +=
`\n\n${index + 1}. 👤 ${user.first_name || "User"}
🆔 ID: ${user.id}
📛 Username: ${username}
🎬 Total Download: ${user.videos || 0}`;
        }
      );
    }

    return ctx.reply(
      text,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🔙 Back",
            "admin_dashboard"
          )
        ]
      ])
    );
  }
);

/* ========================================================= */
/* ======================== BOARDCHAT ====================== */
/* ========================================================= */

bot.action(
  "admin_boardchat",
  async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.answerCbQuery(
        "❌ Access Denied!"
      );
    }

    await ctx.answerCbQuery();

    boardchatAdmin.add(
      ctx.from.id
    );

    return ctx.reply(
`📢 Boardchat

🇧🇩 বাংলা:
📢 সব ইউজারকে যে মেসেজ পাঠাতে চান সেটি এখন পাঠান।

🇬🇧 English:
📢 Now send the message you want to broadcast to all users.

❌ Cancel করতে /cancel লিখুন।`
    );
  }
);

/* ========================================================= */
/* ====================== BOARDCHAT ======================== */
/* ========================================================= */

bot.on(
  "text",
  async (ctx, next) => {

    if (!isAdmin(ctx)) {
      return next();
    }

    if (
      !boardchatAdmin.has(
        ctx.from.id
      )
    ) {
      return next();
    }

    const message =
      ctx.message.text;

    if (
      message === "/cancel"
    ) {

      boardchatAdmin.delete(
        ctx.from.id
      );

      return ctx.reply(
`❌ Boardchat Cancelled!

🇧🇩 বাংলা:
❌ Boardchat বাতিল করা হয়েছে।`
      );
    }

    boardchatAdmin.delete(
      ctx.from.id
    );

    const userIds =
      Object.keys(db.users);

    let success = 0;
    let failed = 0;

    await ctx.reply(
`📢 Broadcasting...

🇧🇩 বাংলা:
📢 সব ইউজারের কাছে মেসেজ পাঠানো হচ্ছে...`
    );

    for (
      const userId of userIds
    ) {

      try {

        await bot.telegram.sendMessage(
          userId,
          message
        );

        success++;

      } catch (err) {

        failed++;

        console.log(
          `Boardchat failed for ${userId}:`,
          err.message
        );
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            50
          )
      );
    }

    return ctx.reply(
`✅ Boardchat Completed!

📤 Successfully Sent: ${success}
❌ Failed: ${failed}

🇧🇩 বাংলা:
✅ Boardchat সম্পন্ন হয়েছে!

📤 সফলভাবে পাঠানো হয়েছে: ${success}
❌ ব্যর্থ: ${failed}`
    );
  }
);

/* ========================================================= */
/* ===================== MESSAGE HANDLER =================== */
/* ========================================================= */

bot.on(
  "text",
  async (ctx) => {

    if (
      isAdmin(ctx) &&
      boardchatAdmin.has(
        ctx.from.id
      )
    ) {
      return;
    }

    const id =
      ctx.from.id;

    const url =
      ctx.message.text.trim();

    if (
      url.startsWith("/")
    ) {
      return;
    }

    const uid =
      String(id);

    /* ===== REGISTER ===== */

    if (!db.users[uid]) {

      db.users[uid] = {
        id: id,
        username:
          ctx.from.username || "",
        first_name:
          ctx.from.first_name || "",
        joined: false,
        videos: 0
      };

      saveDB();
    }

    /* ===== JOIN CHECK ===== */

    if (
      db.users[uid].joined !== true
    ) {

      return ctx.reply(
`❌ Please join first and click I Joined button!

🇧🇩 বাংলা:
❌ প্রথমে চ্যানেলে Join করুন এবং I Joined বাটনে ক্লিক করুন!`
      );
    }

    users.set(
      id,
      "joined"
    );

    /* ===== URL CHECK ===== */

    const isTikTok =
      url.includes("tiktok.com") ||
      url.includes("vm.tiktok.com") ||
      url.includes("vt.tiktok.com");

    const isFacebook =
      url.includes("facebook.com") ||
      url.includes("fb.watch");

    if (
      !isTikTok &&
      !isFacebook
    ) {

      return ctx.reply(
`❌ Please send a valid TikTok or Facebook Reels link!

🇧🇩 বাংলা:
❌ দয়া করে একটি সঠিক TikTok অথবা Facebook Reels লিংক পাঠান!`
      );
    }

    /* ===== DOWNLOADING ===== */

    await ctx.reply(
`⏳ Downloading TikTok video...

🇧🇩 বাংলা:
⏳ TikTok ভিডিও ডাউনলোড হচ্ছে...`
    );

    let data = null;

    /* ===== TIKTOK ===== */

    if (isTikTok) {

      data =
        await getTikTokVideo(
          url
        );
    }

    /* ===== FACEBOOK ===== */

    if (isFacebook) {

      data =
        await getFacebookVideo(
          url
        );
    }

    /* ===== FAILED ===== */

    if (!data?.video) {

      return ctx.reply(
`❌ Failed to download video!

🇧🇩 বাংলা:
❌ ভিডিও ডাউনলোড করা যায়নি!`
      );
    }

    /* ===== STATISTICS ===== */

    db.totalVideos++;

    db.users[uid].videos =
      (db.users[uid].videos || 0) + 1;

    db.users[uid].username =
      ctx.from.username || "";

    db.users[uid].first_name =
      ctx.from.first_name || "";

    saveDB();

    /* ===== SAVE VIDEO ===== */

    userVideos.set(
      id,
      {
        ...data,
        originalUrl:
          data.originalUrl || url
      }
    );

    /* ===== SEND VIDEO ===== */

    return ctx.replyWithVideo(
      {
        url: data.video
      },
      {
        caption:
`📥 Download Completed Successfully!
🎬 Your video is ready to watch and save.

🎧 Want only MP3? Click button below

🇧🇩 বাংলা:
📥 ডাউনলোড সফলভাবে সম্পন্ন হয়েছে!
🎬 আপনার ভিডিওটি দেখা এবং সেভ করার জন্য প্রস্তুত।

🎧 শুধু MP3 চান? নিচের বাটনে ক্লিক করুন।`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "📩 Support ID",
                url:
                  "https://t.me/Smart_Method_Owner"
              }
            ],
            [
              {
                text:
                  "👥 Support Team",
                url:
                  "https://t.me/Global_Method_Channel"
              }
            ],
            [
              {
                text:
                  "🟢 Need MP3",
                callback_data:
                  "get_mp3"
              }
            ]
          ]
        }
      }
    );
  }
);

/* ========================================================= */
/* =========================== MP3 ========================= */
/* ========================================================= */

bot.action(
  "get_mp3",
  async (ctx) => {

    const id =
      ctx.from.id;

    const data =
      userVideos.get(id);

    await ctx.answerCbQuery();

    /* ===== NO VIDEO ===== */

    if (!data) {

      return ctx.reply(
`❌ No video found! Send video again.

🇧🇩 বাংলা:
❌ কোনো ভিডিও পাওয়া যায়নি! আবার ভিডিওটি পাঠান।`
      );
    }

    /* ================= TIKTOK MP3 ================= */

    if (
      data.type === "tiktok"
    ) {

      if (!data.audio) {

        return ctx.reply(
`❌ No audio found! Send video again.

🇧🇩 বাংলা:
❌ কোনো অডিও পাওয়া যায়নি! আবার ভিডিওটি পাঠান।`
        );
      }

      try {

        return ctx.replyWithAudio(
          {
            url: data.audio
          },
          {
            caption:
`🎧 MP3 Downloaded Successfully!

🇧🇩 বাংলা:
🎧 MP3 সফলভাবে ডাউনলোড হয়েছে!`
          }
        );

      } catch (err) {

        console.log(
          "TikTok MP3 error:",
          err.message
        );

        return ctx.reply(
`❌ Failed to download MP3!

🇧🇩 বাংলা:
❌ MP3 ডাউনলোড করা যায়নি!`
        );
      }
    }

    /* ================= FACEBOOK MP3 ================= */

    if (
      data.type === "facebook"
    ) {

      await ctx.reply(
`⏳ Preparing MP3...

🇧🇩 বাংলা:
⏳ MP3 তৈরি করা হচ্ছে...`
      );

      const audioUrl =
        await getFacebookAudio(
          data.originalUrl
        );

      if (!audioUrl) {

        return ctx.reply(
`❌ Failed to download MP3!

🇧🇩 বাংলা:
❌ MP3 ডাউনলোড করা যায়নি!`
        );
      }

      try {

        return ctx.replyWithAudio(
          {
            url: audioUrl
          },
          {
            caption:
`🎧 MP3 Downloaded Successfully!

🇧🇩 বাংলা:
🎧 MP3 সফলভাবে ডাউনলোড হয়েছে!`
          }
        );

      } catch (err) {

        console.log(
          "Facebook MP3 send error:",
          err.message
        );

        return ctx.reply(
`❌ Failed to download MP3!

🇧🇩 বাংলা:
❌ MP3 ডাউনলোড করা যায়নি!`
        );
      }
    }

    return ctx.reply(
`❌ No audio found! Send video again.

🇧🇩 বাংলা:
❌ কোনো অডিও পাওয়া যায়নি! আবার ভিডিওটি পাঠান।`
    );
  }
);

/* ========================================================= */
/* =========================== ERROR ======================= */
/* ========================================================= */

bot.catch(
  (err) => {
    console.log(
      "Bot Error:",
      err
    );
  }
);

/* ========================================================= */
/* =========================== LAUNCH ====================== */
/* ========================================================= */

bot.launch();

console.log(
  "🚀 Bot is running..."
);

/* ================= SAFE STOP ================= */

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);
