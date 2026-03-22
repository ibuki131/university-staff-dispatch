import { useState, useEffect, useRef, useCallback } from "react";
import { registerStore, registerStudent, login } from './api'
// ─── Supabase ────────────────────────────────────────────────
// npm install @supabase/supabase-js qrcode.react html5-qrcode
import { QRCodeSVG } from "qrcode.react";
// html5-qrcode は動的インポートで使用（カメラ起動時のみロード）

// ─── Supabaseクライアント ─────────────────────────────────────
// src/supabase.js を作成して以下を記入してください:
// import { createClient } from '@supabase/supabase-js'
// export const supabase = createClient('YOUR_URL', 'YOUR_ANON_KEY')
import { supabase } from "./supabase.js";
const USE_SUPABASE = !!supabase;

// ============================================================
// MOCK DATA（Supabase未設定時のフォールバック）
// ============================================================
const today = new Date().toISOString().split("T")[0];
const MOCK_STUDENTS = [
  { id: "s1", name: "田中 蓮", university: "東京大学", avatar: "🧑‍🎓", trust_score: 4.7, skills: ["接客","調理補助"], bio: "週3日程度働けます。飲食経験あり。", total_shifts: 12 },
  { id: "s2", name: "山田 美桜", university: "早稲田大学", avatar: "👩‍🎓", trust_score: 4.9, skills: ["接客","洗い場"], bio: "飲食経験2年。笑顔で丁寧な対応が得意。", total_shifts: 28 },
  { id: "s3", name: "鈴木 颯", university: "慶応大学", avatar: "🧑‍💼", trust_score: 4.2, skills: ["ホール","調理補助"], bio: "フレンドリーです！体力あり。", total_shifts: 5 },
];
const MOCK_SHIFTS = [
  { id: "sh1", store_id: "st1", store_name: "炉端焼き 北の大地", store_avatar: "🍻", date: today, start_time: "17:00", end_time: "22:00", wage: 1200, slots: 2, filled_slots: 0, description: "ホールスタッフ募集。まかない付き！", tasks: ["ホール接客","オーダー取り","料理提供"], status: "open", distance: 0.8 },
  { id: "sh2", store_id: "st2", store_name: "麺屋 凛", store_avatar: "🍜", date: today, start_time: "11:00", end_time: "15:00", wage: 1100, slots: 1, filled_slots: 0, description: "昼のピーク帯のみ。未経験歓迎！", tasks: ["洗い場","仕込み補助"], status: "open", distance: 1.2 },
  { id: "sh3", store_id: "st3", store_name: "Bistro Maison", store_avatar: "🍽️", date: new Date(Date.now()+86400000).toISOString().split("T")[0], start_time: "18:00", end_time: "23:00", wage: 1300, slots: 1, filled_slots: 0, description: "ディナータイム。フランス料理。", tasks: ["ホール接客","テーブルセッティング"], status: "open", distance: 2.1 },
];
const MOCK_APPLICATIONS = [
  { id: "ap1", shift_id: "sh1", student_id: "s1", status: "approved" },
  { id: "ap2", shift_id: "sh2", student_id: "s1", status: "pending" },
];
const MOCK_MESSAGES = [
  { id: "m1", sender_id: "st1", text: "田中さん、よろしくお願いします！裏口からお越しください。", created_at: "2025-01-18T14:32:00" },
  { id: "m2", sender_id: "s1",  text: "承知しました！服装は私服で大丈夫ですか？", created_at: "2025-01-18T14:45:00" },
  { id: "m3", sender_id: "st1", text: "はい、私服で構いません。エプロンはこちらで🙂", created_at: "2025-01-18T14:50:00" },
];

// ============================================================
// UTILS
// ============================================================
const formatDate = (d) => { const dt=new Date(d); const days=["日","月","火","水","木","金","土"]; return `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})`; };
const calcWage = (s,e,w) => { const[sh,sm]=s.split(":").map(Number); const[eh,em]=e.split(":").map(Number); return Math.round((eh*60+em-(sh*60+sm))/60*w); };

// QRトークン生成（毎回ユニーク、10分有効）
const generateQRToken = (shiftId, studentId) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CG-${shiftId}-${studentId}-${timestamp}-${random}`;
};

// QRトークンの有効期限（10分）
const QR_EXPIRE_MS = 10 * 60 * 1000;
// ============================================================
// SUPABASE API LAYER（未設定時はモックにフォールバック）
// ============================================================
const api = {
  async getShifts() {
    if (!USE_SUPABASE) return MOCK_SHIFTS;
    const { data } = await supabase
      .from("shifts")
      .select("*, stores(name,avatar,address,lat,lng)")
      .eq("status", "open")
      .order("date");
    return data?.map(s => ({
      ...s,
      store_name: s.stores?.name,
      store_avatar: s.stores?.avatar,
      distance: 0.8, // TODO: 実際の位置情報計算
    })) ?? [];
  },
  async getApplications(studentId) {
    if (!USE_SUPABASE) return MOCK_APPLICATIONS;
    const { data } = await supabase.from("applications").select("*").eq("student_id", studentId);
    return data ?? [];
  },
  async applyShift(shiftId, studentId) {
    if (!USE_SUPABASE) return { id: `ap${Date.now()}`, shift_id: shiftId, student_id: studentId, status: "pending" };
    const { data, error } = await supabase.from("applications").insert({ shift_id: shiftId, student_id: studentId }).select().single();
    if (error) throw error;
    return data;
  },
  async getMessages(shiftId) {
    if (!USE_SUPABASE) return MOCK_MESSAGES;
    const { data } = await supabase.from("chat_messages").select("*").eq("shift_id", shiftId).order("created_at");
    return data ?? [];
  },
  async sendMessage(shiftId, senderId, text) {
    if (!USE_SUPABASE) return { id: `m${Date.now()}`, sender_id: senderId, text, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from("chat_messages").insert({ shift_id: shiftId, sender_id: senderId, text }).select().single();
    if (error) throw error;
    return data;
  },
  async createQRSession(shiftId, studentId) {
    const token = generateQRToken(shiftId, studentId);
    const expiresAt = new Date(Date.now() + QR_EXPIRE_MS).toISOString();
    if (!USE_SUPABASE) return { token, expires_at: expiresAt };
    const { data, error } = await supabase.from("work_sessions").insert({
      shift_id: shiftId, student_id: studentId,
      qr_token: token, qr_expires_at: expiresAt, status: "waiting",
    }).select().single();
    if (error) throw error;
    return data;
  },
  async verifyQRToken(token) {
    if (!USE_SUPABASE) return { valid: true, message: "チェックイン成功！（デモ）" };
    const { data } = await supabase.from("work_sessions").select("*").eq("qr_token", token).single();
    if (!data) return { valid: false, message: "無効なQRコードです" };
    if (new Date(data.qr_expires_at) < new Date()) return { valid: false, message: "QRコードの有効期限が切れています" };
    if (data.status === "checked_in") return { valid: false, message: "すでにチェックイン済みです" };
    await supabase.from("work_sessions").update({ status: "checked_in", checkin_at: new Date().toISOString() }).eq("id", data.id);
    return { valid: true, message: "チェックイン完了！" };
  },
  async login(email, password) {
    if (!USE_SUPABASE) return { user: { id: "s1", type: "student", name: "田中 蓮", university: "東京大学" } };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profile } = await supabase.from("users").select("*").eq("id", data.user.id).single();
    return { user: profile };
  },
  async register(email, password, meta) {
    if (!USE_SUPABASE) return { user: { id: "s1", ...meta } };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    await supabase.from("users").insert({ id: data.user.id, email, ...meta });
    return { user: { id: data.user.id, email, ...meta } };
  },
  subscribeToMessages(shiftId, callback) {
    if (!USE_SUPABASE) return { unsubscribe: () => {} };
    const sub = supabase.channel(`chat-${shiftId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `shift_id=eq.${shiftId}` }, payload => callback(payload.new))
      .subscribe();
    return { unsubscribe: () => supabase.removeChannel(sub) };
  },
};

// ============================================================
// TUTORIAL SLIDES
// ============================================================
const STUDENT_TUTORIAL = [
  { id:1, emoji:"🍱", title:"CampusGigへようこそ！", subtitle:"大学生のための単発バイトアプリ", desc:"大学周辺3km以内の飲食店と直接つながり、今日から働ける！単発・短時間OKで、シフトに縛られない新しい働き方。", bg:"linear-gradient(145deg,#1a0a00,#3d1500)", accent:"#FF9500", points:[] },
  { id:2, emoji:"📋", title:"STEP 1：募集を見て応募", subtitle:"今日の仕事がすぐ見つかる", desc:"ホーム画面に「今日の募集」が距離順で表示されます。気になるシフトをタップして詳細を確認し、「応募する」を押すだけ！", bg:"linear-gradient(145deg,#002010,#004020)", accent:"#5DDB6F", points:["時給・勤務時間・想定収入を一目で確認","通勤距離（km）も表示","複数の店舗に同時応募OK"] },
  { id:3, emoji:"✅", title:"STEP 2：店舗から承認を受ける", subtitle:"先着ではなく店舗が選ぶ仕組み", desc:"応募後は店舗オーナーがプロフィールを見て選考します。承認されるとプッシュ通知が届き、住所とチャットが解放されます！", bg:"linear-gradient(145deg,#001018,#002535)", accent:"#4FC3F7", points:["通知で承認を即座に受け取れる","承認後に店舗の住所が表示される","承認後にチャットが開放される"] },
  { id:4, emoji:"💬", title:"STEP 3：チャットで当日を確認", subtitle:"承認されたらトークが始まる", desc:"承認後は店舗と直接チャットできます。持ち物・服装・集合場所など、当日の詳細を確認しましょう。", bg:"linear-gradient(145deg,#100018,#250035)", accent:"#C084FC", points:["リアルタイムでメッセージを送受信","チャットは承認済みシフトのみ開放","不明点は事前に全部確認しよう"] },
  { id:5, emoji:"📱", title:"STEP 4：QRでチェックイン", subtitle:"当日はQRコードで勤務開始", desc:"承認済みシフト画面からQRコードを表示。10分ごとに新しいコードが生成されます。店舗スタッフにカメラでスキャンしてもらってください！", bg:"linear-gradient(145deg,#0a1500,#1a2800)", accent:"#FCD34D", points:["シフト詳細 → 「QRチェックインを表示」","10分ごとに自動更新される安全なQR","退勤時は「終了申請」を送信"] },
  { id:6, emoji:"⭐", title:"信頼スコアの仕組み", subtitle:"あなたの価値を数字で証明しよう", desc:"勤務後に店舗があなたを5段階で評価します。その評価が「信頼スコア」に反映され、将来の応募で優先されます！", bg:"linear-gradient(145deg,#1a1000,#332000)", accent:"#F59E0B", points:[],
    scoreTable:[
      { label:"勤務評価 ⭐⭐⭐⭐⭐", effect:"スコア +0.3〜+0.5", color:"#5DDB6F" },
      { label:"勤務評価 ⭐⭐⭐⭐", effect:"スコア +0.1〜+0.2", color:"#A3E635" },
      { label:"勤務評価 ⭐〜⭐⭐⭐", effect:"スコア 変動なし", color:"#94A3B8" },
      { label:"2日前以降キャンセル", effect:"スコア −1.0", color:"#F87171" },
      { label:"無断キャンセル", effect:"スコア −2.0 & 警告", color:"#EF4444" },
    ]
  },
  { id:7, emoji:"🏆", title:"スコアでランクが上がる", subtitle:"信頼が高いほどもっと活躍できる", desc:"信頼スコアが上がるほど目立つバッジが付き、店舗からのオファーが届きやすくなります。", bg:"linear-gradient(145deg,#1a0500,#300a00)", accent:"#FF9500", points:[],
    rankTable:[
      { rank:"🥉 ブロンズ", score:"3.0〜3.9", perk:"基本機能が使用可能" },
      { rank:"🥈 シルバー", score:"4.0〜4.4", perk:"優先表示 & 応募数+3" },
      { rank:"🥇 ゴールド", score:"4.5〜4.7", perk:"シフト先行閲覧 & 優先承認" },
      { rank:"💎 ダイヤ", score:"4.8以上", perk:"独占オファー & 報酬ボーナス" },
    ]
  },
];
const STORE_TUTORIAL = [
  { id:1, emoji:"🏪", title:"CampusGigへようこそ！", subtitle:"飲食店向け学生マッチングサービス", desc:"急な人手不足もこれで解決。大学周辺3km以内の大学生に、今すぐシフト募集を届けましょう。", bg:"linear-gradient(145deg,#0a0018,#1a0035)", accent:"#A855F7", points:[] },
  { id:2, emoji:"➕", title:"STEP 1：シフトを作成する", subtitle:"ホームのボタンですぐ作れる", desc:"ホーム画面の「シフトを作成する」ボタンをタップ。日時・時給・募集人数・作業内容を入力して公開するだけ！", bg:"linear-gradient(145deg,#002010,#004020)", accent:"#34D399", points:["公開後すぐに近隣学生に通知が届く","作業タグで仕事内容を明確に伝えられる","複数シフトの同時管理が可能"] },
  { id:3, emoji:"👥", title:"STEP 2：応募者を選考する", subtitle:"先着ではなくオーナーが選ぶ", desc:"応募者の信頼スコア・勤務実績・スキルを見て、ベストな学生を選べます。", bg:"linear-gradient(145deg,#001018,#002535)", accent:"#38BDF8", points:["信頼スコアでひと目で実力がわかる","スキルタグで経験を確認できる","見送りも1タップで完了"] },
  { id:4, emoji:"📷", title:"STEP 3：QRスキャンでチェックイン", subtitle:"学生のQRをカメラで読み取るだけ", desc:"学生が表示するQRコードをカメラでスキャン。勤務開始が自動記録されます。QRは10分ごとに更新されるので不正利用防止にもなります。", bg:"linear-gradient(145deg,#1a1000,#332000)", accent:"#F59E0B", points:["シフト管理 → 「QRスキャン」","スキャン後に勤務時間が自動記録","終了時は学生の「終了申請」を承認"] },
  { id:5, emoji:"💰", title:"料金プランについて", subtitle:"使った分だけ、シンプルな課金", desc:"月額1,000円のサブスクに加え、勤務完了ごとに500円の成果報酬。採用できなければ追加料金なし！", bg:"linear-gradient(145deg,#0a1500,#1a2500)", accent:"#FCD34D", points:[],
    priceTable:[
      { item:"月額サブスク（基本料）", price:"¥1,000/月", note:"シフト作成・管理が無制限" },
      { item:"成果報酬（勤務完了時）", price:"¥500/件", note:"採用・勤務完了後のみ発生" },
      { item:"採用できなかった場合", price:"¥0", note:"追加料金は一切なし" },
    ]
  },
];

// ============================================================
// STYLES
// ============================================================
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  :root{
    --amber:#FF9500;--amber2:#FFBC00;--amber-dim:rgba(255,149,0,0.13);
    --bg:#111009;--bg2:#1C1A10;--bg3:#272418;--bg4:#322E1E;
    --white:#FFF8ED;--white2:#E8DEC8;--gray:#7A7260;--gray2:#4A4538;
    --border:rgba(255,200,80,0.09);--green:#5DDB6F;--blue:#4FC3F7;
    --red:#FF6B6B;--purple:#C084FC;--radius:18px;
  }
  html,body{height:100%;background:#0a0900;}
  #root{height:100%;}
  .app{display:flex;flex-direction:column;height:100vh;max-width:430px;margin:0 auto;background:var(--bg);overflow:hidden;font-family:'Noto Sans JP','Outfit',sans-serif;color:var(--white);}
  .scroll-area{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;}
  .scroll-area::-webkit-scrollbar{display:none;}
  .bottom-nav{display:flex;background:var(--bg2);border-top:1px solid var(--border);padding:8px 0 20px;flex-shrink:0;position:relative;}
  .bottom-nav::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,180,60,0.35),transparent);}
  .nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:none;cursor:pointer;padding:6px 0;color:var(--gray);font-size:10px;font-weight:500;transition:color 0.2s;font-family:'Noto Sans JP',sans-serif;}
  .nav-btn.active{color:var(--amber);}
  .nav-icon{font-size:22px;line-height:1;}
  .nav-dot{position:absolute;top:0;right:4px;background:var(--amber);width:8px;height:8px;border-radius:50%;border:2px solid var(--bg2);}
  .outfit{font-family:'Outfit',sans-serif;}
  .fw-600{font-weight:600;}.fw-700{font-weight:700;}.fw-800{font-weight:800;}.fw-900{font-weight:900;}
  .text-xs{font-size:11px;}.text-sm{font-size:13px;}.text-lg{font-size:18px;}.text-xl{font-size:22px;}.text-2xl{font-size:28px;}
  .text-amber{color:var(--amber);}.text-gray{color:var(--gray);}.text-green{color:var(--green);}.text-red{color:var(--red);}
  .px-5{padding-left:20px;padding-right:20px;}
  .pt-4{padding-top:16px;}.pt-6{padding-top:24px;}.pb-24{padding-bottom:96px;}.pb-4{padding-bottom:16px;}
  .gap-2{gap:8px;}.gap-3{gap:12px;}
  .flex{display:flex;}.flex-col{flex-direction:column;}
  .items-center{align-items:center;}
  .justify-between{justify-content:space-between;}.justify-center{justify-content:center;}
  .flex-1{flex:1;}.w-full{width:100%;}.relative{position:relative;}
  .text-center{text-align:center;}
  .card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
  .card-glow{background:var(--bg2);border:1px solid rgba(255,149,0,0.2);border-radius:var(--radius);box-shadow:0 0 24px rgba(255,149,0,0.07);}
  .card-hover{cursor:pointer;transition:transform 0.15s,border-color 0.2s;}
  .card-hover:active{transform:scale(0.985);border-color:rgba(255,149,0,0.4);}
  .shift-pad{padding:16px;}
  .avatar{width:44px;height:44px;border-radius:12px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;border:1px solid var(--border);}
  .avatar-lg{width:64px;height:64px;border-radius:18px;font-size:36px;}
  .badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;font-family:'Outfit',sans-serif;}
  .badge-amber{background:rgba(255,149,0,0.18);color:var(--amber);border:1px solid rgba(255,149,0,0.25);}
  .badge-green{background:rgba(93,219,111,0.15);color:var(--green);border:1px solid rgba(93,219,111,0.25);}
  .badge-gray{background:rgba(122,114,96,0.2);color:var(--gray);}
  .badge-blue{background:rgba(79,195,247,0.15);color:var(--blue);}
  .badge-red{background:rgba(255,107,107,0.15);color:var(--red);}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;border-radius:14px;font-family:'Noto Sans JP',sans-serif;font-weight:700;transition:all 0.15s;}
  .btn:active{transform:scale(0.97);}
  .btn-amber{background:linear-gradient(135deg,#FF9500,#FFBC00);color:#1a1000;padding:14px 24px;font-size:15px;box-shadow:0 4px 24px rgba(255,149,0,0.38);}
  .btn-outline{background:transparent;color:var(--amber);border:1.5px solid rgba(255,149,0,0.5);padding:12px 20px;font-size:14px;}
  .btn-ghost{background:var(--bg3);color:var(--white2);padding:12px 20px;font-size:14px;border:1px solid var(--border);}
  .btn-sm{padding:9px 16px;font-size:13px;border-radius:10px;}
  .btn-danger{background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25);}
  .btn-success{background:rgba(93,219,111,0.12);color:var(--green);border:1px solid rgba(93,219,111,0.25);}
  .input-group{display:flex;flex-direction:column;gap:6px;}
  .input-label{font-size:11px;color:var(--gray);font-weight:700;letter-spacing:0.8px;text-transform:uppercase;font-family:'Outfit',sans-serif;}
  .input{background:var(--bg3);border:1.5px solid var(--border);border-radius:12px;padding:13px 16px;color:var(--white);font-family:'Noto Sans JP',sans-serif;font-size:15px;outline:none;transition:border-color 0.2s;width:100%;}
  .input:focus{border-color:rgba(255,149,0,0.6);box-shadow:0 0 0 3px rgba(255,149,0,0.08);}
  .input::placeholder{color:var(--gray2);}
  select.input{appearance:none;}
  textarea.input{resize:none;}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;flex-shrink:0;background:var(--bg);border-bottom:1px solid var(--border);}
  .topbar-title{font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;}
  .topbar-back{display:flex;align-items:center;gap:6px;background:none;border:none;color:var(--amber);font-family:'Noto Sans JP',sans-serif;font-size:14px;font-weight:700;cursor:pointer;}
  .stat-box{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:14px 12px;text-align:center;flex:1;}
  .stat-num{font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;color:var(--amber);line-height:1;}
  .stat-label{font-size:11px;color:var(--gray);margin-top:4px;}
  .msg{max-width:76%;}
  .msg.mine{align-self:flex-end;}
  .msg.theirs{align-self:flex-start;}
  .msg-bubble{padding:10px 14px;border-radius:18px;font-size:14px;line-height:1.55;}
  .msg.mine .msg-bubble{background:linear-gradient(135deg,#FF9500,#FFBC00);color:#1a1000;border-bottom-right-radius:4px;font-weight:600;}
  .msg.theirs .msg-bubble{background:var(--bg3);border-bottom-left-radius:4px;border:1px solid var(--border);}
  .msg-time{font-size:10px;color:var(--gray);margin-top:4px;padding:0 4px;}
  .chat-input-bar{display:flex;gap:10px;padding:12px 16px;background:var(--bg2);border-top:1px solid var(--border);flex-shrink:0;}
  .chat-input{flex:1;background:var(--bg3);border:1.5px solid var(--border);border-radius:22px;padding:11px 16px;color:var(--white);font-family:'Noto Sans JP',sans-serif;font-size:14px;outline:none;}
  .chat-input:focus{border-color:rgba(255,149,0,0.5);}
  .send-btn{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#FF9500,#FFBC00);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:#1a1000;font-weight:900;}
  .section-header{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 12px;}
  .section-title{font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;}
  .tabs{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:12px;}
  .tab{flex:1;text-align:center;padding:10px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;border:none;background:none;color:var(--gray);font-family:'Noto Sans JP',sans-serif;}
  .tab.active{background:linear-gradient(135deg,#FF9500,#FFBC00);color:#1a1000;}
  .trust-ring{width:58px;height:58px;border-radius:50%;border:2.5px solid var(--amber);display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:var(--amber);flex-shrink:0;background:var(--amber-dim);}
  .toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#FF9500,#FFBC00);color:#1a1000;border-radius:14px;padding:12px 24px;font-weight:700;font-size:14px;z-index:9999;box-shadow:0 8px 36px rgba(255,149,0,0.5);white-space:nowrap;animation:toastIn 0.3s cubic-bezier(.34,1.56,.64,1);font-family:'Noto Sans JP',sans-serif;}
  .toast.error{background:linear-gradient(135deg,#FF6B6B,#FF4040);color:white;}
  @keyframes toastIn{from{top:-50px;opacity:0;}to{top:20px;opacity:1;}}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:200;display:flex;align-items:flex-end;animation:fadeIn 0.2s;}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  .modal-sheet{background:var(--bg2);border-radius:28px 28px 0 0;width:100%;padding:20px;animation:slideUp 0.3s cubic-bezier(.34,1.2,.64,1);border-top:1px solid rgba(255,149,0,0.15);}
  @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
  .modal-handle{width:40px;height:4px;background:var(--bg4);border-radius:99px;margin:0 auto 20px;}
  .star-input{font-size:38px;cursor:pointer;transition:transform 0.1s;background:none;border:none;}
  .star-input:active{transform:scale(1.3);}
  .sep{display:flex;align-items:center;gap:12px;}
  .sep::before,.sep::after{content:'';flex:1;height:1px;background:var(--border);}
  .sep span{font-size:12px;color:var(--gray);}
  .big-create-btn{background:linear-gradient(135deg,#FF9500,#FFBC00);border:none;border-radius:22px;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;width:calc(100% - 32px);margin:16px;color:#1a1000;box-shadow:0 8px 44px rgba(255,149,0,0.42);transition:transform 0.15s;font-family:'Noto Sans JP',sans-serif;position:relative;overflow:hidden;}
  .big-create-btn::before{content:'';position:absolute;top:-30px;right:-30px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.15);}
  .big-create-btn:active{transform:scale(0.98);}
  .settings-row{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;}
  .settings-row:active{background:var(--bg3);}
  .settings-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}

  /* QR & SCANNER */
  .qr-container{background:white;border-radius:20px;padding:20px;display:inline-flex;flex-direction:column;align-items:center;gap:12px;}
  .qr-timer{display:flex;align-items:center;gap:6px;background:var(--amber-dim);border:1px solid rgba(255,149,0,0.3);border-radius:99px;padding:6px 14px;font-size:12px;color:var(--amber);font-weight:700;font-family:'Outfit',sans-serif;}
  .qr-timer.expiring{background:rgba(255,107,107,0.15);border-color:rgba(255,107,107,0.3);color:var(--red);}
  .scanner-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:300;display:flex;flex-direction:column;}
  .scanner-frame{position:relative;width:260px;height:260px;margin:0 auto;}
  .scanner-corner{position:absolute;width:24px;height:24px;border-color:var(--amber);border-style:solid;}
  .scan-line{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--amber),transparent);animation:scanAnim 2s linear infinite;}
  @keyframes scanAnim{0%{top:0;}100%{top:100%;}}

  /* TUTORIAL */
  .tut-overlay{position:fixed;inset:0;z-index:500;display:flex;flex-direction:column;overflow:hidden;}
  .tut-progress{display:flex;gap:6px;justify-content:center;padding:52px 0 16px;}
  .tut-dot{width:28px;height:4px;border-radius:99px;background:rgba(255,255,255,0.15);transition:all 0.3s;}
  .tut-dot.active{background:var(--amber);width:40px;}
  .tut-content{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 24px;overflow-y:auto;}
  .tut-content::-webkit-scrollbar{display:none;}
  .tut-emoji-box{width:100px;height:100px;border-radius:28px;display:flex;align-items:center;justify-content:center;font-size:56px;margin:0 auto 24px;box-shadow:0 8px 40px rgba(0,0,0,0.5);}
  .tut-point{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.07);border-radius:12px;padding:10px 14px;}
  .tut-table-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.06);border-radius:10px;}
  .tut-rank-row{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.06);border-radius:10px;}
`;
function injectStyles() {
  if (document.getElementById("cg-styles")) return;
  const s = document.createElement("style"); s.id = "cg-styles"; s.textContent = CSS; document.head.appendChild(s);
}

// ============================================================
// TOAST
// ============================================================
function Toast({ msg, type="ok", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast ${type==="error"?"error":""}`}>{type==="ok"?"✓ ":""}{msg}</div>;
}

// ============================================================
// QR CODE DISPLAY (with live countdown timer)
// ============================================================
function QRDisplay({ shiftId, studentId }) {
  const [token, setToken] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_EXPIRE_MS / 1000);

  const refresh = useCallback(async () => {
    const session = await api.createQRSession(shiftId, studentId);
    setToken(session.token ?? session.qr_token);
    setSecondsLeft(QR_EXPIRE_MS / 1000);
  }, [shiftId, studentId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { refresh(); return QR_EXPIRE_MS / 1000; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");
  const isExpiring = secondsLeft <= 60;

  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16 }}>
      {token ? (
        <div className="qr-container">
          <QRCodeSVG
            value={token}
            size={220}
            bgColor="#ffffff"
            fgColor="#111009"
            level="H"
            includeMargin={false}
          />
          <div style={{ fontSize:10,color:"#555",fontFamily:"Outfit,sans-serif",letterSpacing:1 }}>
            {token.substring(0,28)}...
          </div>
        </div>
      ) : (
        <div style={{ width:260,height:260,background:"var(--bg3)",borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ color:"var(--gray)",fontSize:13 }}>生成中...</div>
        </div>
      )}

      {/* Countdown */}
      <div className={`qr-timer ${isExpiring?"expiring":""}`}>
        <span>{isExpiring?"⚠️":"🔒"}</span>
        <span>有効期限: {mins}:{secs}</span>
      </div>

      <div style={{ fontSize:12,color:"var(--gray)",textAlign:"center",lineHeight:1.6 }}>
        {isExpiring
          ? "まもなく自動更新されます"
          : "このQRコードは10分で自動的に更新されます"
        }
      </div>

      <button className="btn btn-ghost btn-sm" onClick={refresh}>🔄 今すぐ更新</button>
    </div>
  );
}
// ============================================================
// QR SCANNER (camera)
// ============================================================
function QRScanner({ onResult, onClose }) {
  const instanceRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let scanner;
    const start = async () => {
      try {
        // html5-qrcode を動的インポート
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("qr-reader");
        instanceRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            // スキャン成功
            setScanning(false);
            onResult(decodedText);
          },
          () => {} // scan失敗は無視
        );
        setScanning(true);
      } catch (err) {
        setError("カメラへのアクセスを許可してください。\n" + err.message);
      }
    };
    start();
    return () => {
      instanceRef.current?.stop().catch(() => {});
    };
  }, [onResult]);
  return (
    <div className="scanner-overlay">
      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"52px 20px 20px" }}>
        <div>
          <div className="outfit fw-800" style={{ fontSize:20 }}>QRスキャン</div>
          <div style={{ color:"var(--gray)",fontSize:13,marginTop:2 }}>学生のQRコードをカメラに向けてください</div>
        </div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"white",borderRadius:99,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"Noto Sans JP,sans-serif",fontWeight:700 }}>閉じる</button>
      </div>

      {/* Camera view */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,padding:"0 20px" }}>
        {error ? (
          <div style={{ textAlign:"center",padding:"40px 20px" }}>
            <div style={{ fontSize:48,marginBottom:16 }}>📷</div>
            <div style={{ color:"var(--red)",fontSize:14,lineHeight:1.7,whiteSpace:"pre-line" }}>{error}</div>
            <div style={{ marginTop:16,color:"var(--gray)",fontSize:12 }}>
              ブラウザの設定からカメラのアクセスを許可してください
            </div>
          </div>
        ) : (
          <>
            {/* Scanner frame */}
            <div className="scanner-frame">
              <div id="qr-reader" style={{ width:"100%",height:"100%",borderRadius:16,overflow:"hidden" }} />
              {/* Corner decorations */}
              {[
                { top:0,left:0,borderTopWidth:3,borderLeftWidth:3,borderRightWidth:0,borderBottomWidth:0,borderTopLeftRadius:8 },
                { top:0,right:0,borderTopWidth:3,borderRightWidth:3,borderLeftWidth:0,borderBottomWidth:0,borderTopRightRadius:8 },
                { bottom:0,left:0,borderBottomWidth:3,borderLeftWidth:3,borderRightWidth:0,borderTopWidth:0,borderBottomLeftRadius:8 },
                { bottom:0,right:0,borderBottomWidth:3,borderRightWidth:3,borderLeftWidth:0,borderTopWidth:0,borderBottomRightRadius:8 },
              ].map((style,i) => <div key={i} className="scanner-corner" style={style} />)}
              {scanning && <div className="scan-line" />}
            </div>
            <div style={{ textAlign:"center",color:"var(--gray)",fontSize:13,lineHeight:1.6 }}>
              QRコードを枠内に収めると<br/>自動的に読み取ります
            </div>
          </>
        )}
      </div>
    </div>
  );
}
// ============================================================
// TUTORIAL SCREEN
// ============================================================
function TutorialScreen({ role, onFinish, fromSettings }) {
  const slides = role === "store" ? STORE_TUTORIAL : STUDENT_TUTORIAL;
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const slide = slides[idx];
  const isLast = idx === slides.length - 1;

  const navigate = (dir) => {
    setVisible(false);
    setTimeout(() => { setIdx(i => i + dir); setVisible(true); }, 220);
  };

  const btnColor = ["#FCD34D","#7AE03A","#34D399"].includes(slide.accent) ? "#1a1000" : "white";

  return (
    <div className="tut-overlay" style={{ background:slide.bg }}>
      <div style={{ position:"absolute",top:-80,right:-80,width:260,height:260,borderRadius:"50%",background:`${slide.accent}18`,filter:"blur(40px)",pointerEvents:"none" }}/>
      <div className="tut-progress">
        {slides.map((_,i) => <div key={i} className={`tut-dot ${i===idx?"active":""}`} style={i===idx?{background:slide.accent}:{}} />)}
      </div>
      <div style={{ position:"absolute",top:50,right:20 }}>
        <button onClick={onFinish} style={{ background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.65)",borderRadius:99,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:"Noto Sans JP,sans-serif",fontWeight:700 }}>
          {fromSettings?"閉じる":"スキップ"}
        </button>
      </div>
      <div className="tut-content">
        <div style={{ transition:"opacity 0.22s,transform 0.22s",opacity:visible?1:0,transform:visible?"none":"translateY(16px)" }}>
          <div className="tut-emoji-box" style={{ background:`${slide.accent}20`,border:`2px solid ${slide.accent}40` }}>{slide.emoji}</div>
          <div style={{ textAlign:"center",marginBottom:20 }}>
            <div style={{ fontSize:11,color:slide.accent,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontFamily:"Outfit,sans-serif" }}>{slide.subtitle}</div>
            <div style={{ fontFamily:"Outfit,sans-serif",fontSize:24,fontWeight:900,lineHeight:1.2,marginBottom:12,color:"white" }}>{slide.title}</div>
            <div style={{ fontSize:13.5,lineHeight:1.75,color:"rgba(255,255,255,0.7)",maxWidth:320,margin:"0 auto" }}>{slide.desc}</div>
          </div>
          {slide.points?.length > 0 && <div style={{ display:"flex",flexDirection:"column",gap:8,marginBottom:8 }}>{slide.points.map((p,i)=><div key={i} className="tut-point" style={{ border:`1px solid ${slide.accent}28` }}><div style={{ width:6,height:6,borderRadius:"50%",background:slide.accent,flexShrink:0 }}/><div style={{ fontSize:13,color:"rgba(255,255,255,0.85)" }}>{p}</div></div>)}</div>}
          {slide.scoreTable && <div style={{ display:"flex",flexDirection:"column",gap:6 }}>{slide.scoreTable.map((r,i)=><div key={i} className="tut-table-row"><div style={{ fontSize:13,color:"rgba(255,255,255,0.8)" }}>{r.label}</div><div style={{ fontSize:13,fontWeight:700,color:r.color,fontFamily:"Outfit,sans-serif" }}>{r.effect}</div></div>)}</div>}
          {slide.rankTable && <div style={{ display:"flex",flexDirection:"column",gap:6 }}>{slide.rankTable.map((r,i)=><div key={i} className="tut-rank-row"><div style={{ minWidth:80,fontSize:13,fontWeight:700,fontFamily:"Outfit,sans-serif",color:"white" }}>{r.rank}</div><div style={{ flex:1 }}><div style={{ fontSize:11,color:"rgba(255,255,255,0.45)",marginBottom:2 }}>{r.score}</div><div style={{ fontSize:13,color:"rgba(255,255,255,0.8)" }}>{r.perk}</div></div></div>)}</div>}
          {slide.priceTable && <div style={{ display:"flex",flexDirection:"column",gap:6 }}>{slide.priceTable.map((r,i)=><div key={i} className="tut-rank-row" style={{ flexDirection:"column",alignItems:"flex-start" }}><div style={{ display:"flex",justifyContent:"space-between",width:"100%",marginBottom:3 }}><div style={{ fontSize:13,color:"rgba(255,255,255,0.8)" }}>{r.item}</div><div style={{ fontSize:14,fontWeight:800,color:slide.accent,fontFamily:"Outfit,sans-serif" }}>{r.price}</div></div><div style={{ fontSize:11,color:"rgba(255,255,255,0.4)" }}>{r.note}</div></div>)}</div>}
        </div>
      </div>
      <div style={{ padding:"16px 24px 44px",display:"flex",gap:10,flexShrink:0 }}>
        {idx > 0 && <button onClick={()=>navigate(-1)} style={{ flex:1,padding:"14px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"white",borderRadius:14,fontSize:15,cursor:"pointer",fontFamily:"Noto Sans JP,sans-serif",fontWeight:700 }}>← 戻る</button>}
        <button onClick={isLast?onFinish:()=>navigate(1)} style={{ flex:2,padding:"14px",background:`linear-gradient(135deg,${slide.accent},${slide.accent}bb)`,border:"none",color:btnColor,borderRadius:14,fontSize:15,cursor:"pointer",fontFamily:"Noto Sans JP,sans-serif",fontWeight:800,boxShadow:`0 6px 28px ${slide.accent}50` }}>
          {isLast?(fromSettings?"閉じる ✓":"はじめる 🚀"):"次へ →"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AUTH
// ============================================================
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [uni, setUni] = useState("");
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [modeComplete, setModeComplete] = useState(false);

  const doLogin = async () => {
    setLoading(true); setErr("");
    try {
      const res = await login({ email, password: pass });
      onLogin(res.user || res);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const doRegister = async () => {
    if (!name || !email || !pass || !uni) {
      setErr('すべての項目を入力してください');
      return;
    }
    setLoading(true); setErr("");
    try {
      await registerStudent({ name, email, password: pass, university: uni });
      const res = await login({ email, password: pass });
      onLogin(res.user || res);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const doStoreRegister = async () => {
    if (!storeName || !email || !pass) {
      setErr('すべての項目を入力してください');
      return;
    }
    setLoading(true); setErr("");
    try {
      await registerStore({ storeName, email, password: pass, category, address });
      setModeComplete(true);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  if (modeComplete) {
    return (
      <div className="app" style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>📨</div>
          <div className="outfit fw-900" style={{ fontSize: 24, marginBottom: 12 }}>申請を受け付けました！</div>
          <div style={{ color: 'var(--gray)', fontSize: 14, lineHeight: 1.8, marginBottom: 32 }}>
            審査完了後（1〜2営業日）に<br/>
            登録メールアドレスへご連絡します。<br/>
            承認後にログインできるようになります。
          </div>
          <button className="btn btn-ghost" onClick={() => { setMode('login'); setModeComplete(false); }}>
            ログイン画面へ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app" style={{ justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <div style={{ width: 340, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 18, padding: 20 }}>
        <h1 className="outfit fw-800" style={{ fontSize: 22, marginBottom: 12, textAlign: 'center' }}>CampusGig</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={`btn ${mode === 'login' ? 'btn-amber' : 'btn-ghost'} btn-sm`} style={{ flex: 1 }} onClick={() => setMode('login')}>ログイン</button>
          <button className={`btn ${mode === 'register' ? 'btn-amber' : 'btn-ghost'} btn-sm`} style={{ flex: 1 }} onClick={() => setMode('register')}>学生登録</button>
          <button className={`btn ${mode === 'store' ? 'btn-amber' : 'btn-ghost'} btn-sm`} style={{ flex: 1 }} onClick={() => setMode('store')}>店舗登録</button>
        </div>

        {err && <div style={{ marginBottom: 12, color: 'var(--red)', fontSize: 12 }}>{err}</div>}

        {mode !== 'store' && (
          <div className="input-group" style={{ marginBottom: 10 }}>
            {mode === 'register' && (
              <><label className="input-label">氏名</label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="例：田中 蓮" /></>
            )}
            {mode === 'register' && (
              <><label className="input-label">大学</label><input className="input" value={uni} onChange={e => setUni(e.target.value)} placeholder="例：東京大学" /></>
            )}
            <label className="input-label">メール</label>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" />
            <label className="input-label">パスワード</label>
            <input className="input" value={pass} onChange={e => setPass(e.target.value)} type="password" />
          </div>
        )}

        {mode === 'store' && (
          <div className="input-group" style={{ marginBottom: 10 }}>
            <label className="input-label">店舗名</label>
            <input className="input" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="例：炉端焼き 北の大地" />
            <label className="input-label">カテゴリ</label>
            <input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="例：居酒屋" />
            <label className="input-label">住所</label>
            <input className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="例：東京都千代田区" />
            <label className="input-label">メール</label>
            <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" />
            <label className="input-label">パスワード</label>
            <input className="input" value={pass} onChange={e => setPass(e.target.value)} type="password" />
          </div>
        )}

        <button className="btn btn-amber" style={{ width: '100%' }} onClick={mode === 'login' ? doLogin : mode === 'register' ? doRegister : doStoreRegister} disabled={loading}>
          {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'register' ? '登録して開始' : '店舗登録'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SHIFT DETAIL
// ============================================================
function ShiftDetail({ shift, user, onBack, onApply, onChat, appStatus }) {
  const [showQR, setShowQR] = useState(false);
  const earnings = calcWage(shift.start_time, shift.end_time, shift.wage);
  const hours = ((new Date(`2000-01-01T${shift.end_time}`)-new Date(`2000-01-01T${shift.start_time}`))/3600000).toFixed(1);
  const isApproved = appStatus==="approved";

  return (
    <div className="app">
      <div className="topbar"><button className="topbar-back" onClick={onBack}>← 戻る</button><div className="topbar-title" style={{ fontSize:16 }}>シフト詳細</div><div style={{ width:60 }}/></div>
      <div className="scroll-area pb-24">
        <div style={{ background:"linear-gradient(160deg,var(--bg2),var(--bg3))",padding:"24px 20px",borderBottom:"1px solid var(--border)" }}>
          <div className="flex gap-3 items-center" style={{ marginBottom:16 }}>
            <div className="avatar avatar-lg">{shift.store_avatar}</div>
            <div><div className="outfit fw-800 text-lg">{shift.store_name}</div><div style={{ color:"var(--gray)",fontSize:13 }}>📍 {shift.distance}km · 徒歩約{Math.round(shift.distance*12)}分</div></div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
            <div className="stat-box"><div className="stat-num" style={{ fontSize:18 }}>¥{shift.wage}</div><div className="stat-label">時給</div></div>
            <div className="stat-box"><div className="stat-num" style={{ fontSize:18 }}>{hours}h</div><div className="stat-label">勤務時間</div></div>
            <div className="stat-box"><div className="stat-num" style={{ fontSize:16 }}>¥{earnings.toLocaleString()}</div><div className="stat-label">想定収入</div></div>
          </div>
        </div>
        <div style={{ padding:"20px" }}>
          <div className="card shift-pad" style={{ marginBottom:12 }}>
            {[["📅","勤務日",formatDate(shift.date)],["⏰","時間",`${shift.start_time} 〜 ${shift.end_time}`],["👥","募集人数",`${shift.filled_slots||0}/${shift.slots}名`]].map(([icon,label,val])=>(
              <div key={label} className="flex items-center gap-3" style={{ marginBottom:10 }}>
                <span style={{ fontSize:22 }}>{icon}</span>
                <div><div style={{ fontSize:12,color:"var(--gray)" }}>{label}</div><div className="fw-600">{val}</div></div>
              </div>
            ))}
          </div>
          <div className="card shift-pad" style={{ marginBottom:12 }}>
            <div style={{ fontSize:13,color:"var(--gray)",marginBottom:8 }}>仕事内容</div>
            <div style={{ fontSize:14,lineHeight:1.7,marginBottom:12 }}>{shift.description}</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>{shift.tasks?.map(t=><span key={t} className="badge badge-amber">{t}</span>)}</div>
          </div>
          {user.type==="student" && (
            isApproved ? (
              <div style={{ background:"rgba(93,219,111,0.08)",border:"1px solid rgba(93,219,111,0.25)",borderRadius:16,padding:"16px" }}>
                <div className="flex items-center gap-2" style={{ marginBottom:8 }}><span>✅</span><div className="fw-700 text-green">応募が承認されました！</div></div>
                <div style={{ fontSize:13,color:"var(--gray)",marginBottom:12 }}>📍 {shift.address || "承認後に住所が表示されます"}</div>
                <div className="flex gap-2">
                  <button className="btn btn-success btn-sm" style={{ flex:1 }} onClick={onChat}>💬 チャット</button>
                  <button className="btn btn-amber btn-sm" style={{ flex:1 }} onClick={()=>setShowQR(true)}>📱 QR表示</button>
                </div>
              </div>
            ) : appStatus==="pending" ? (
              <div style={{ background:"rgba(255,188,0,0.08)",border:"1px solid rgba(255,188,0,0.2)",borderRadius:16,padding:"20px",textAlign:"center" }}>
                <div style={{ fontSize:32,marginBottom:8 }}>⏳</div>
                <div className="fw-700 text-amber">審査中</div>
                <div style={{ fontSize:13,color:"var(--gray)",marginTop:4 }}>店舗オーナーが確認しています</div>
              </div>
            ) : (
              <button className="btn btn-amber" style={{ width:"100%",borderRadius:16 }} onClick={onApply}>応募する 🚀</button>
            )
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showQR && (
        <div className="modal-overlay" onClick={()=>setShowQR(false)}>
          <div className="modal-sheet" style={{ maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div className="modal-handle"/>
            <div style={{ textAlign:"center",marginBottom:20 }}>
              <div className="outfit fw-800 text-xl" style={{ marginBottom:4 }}>チェックインQR</div>
              <div style={{ color:"var(--gray)",fontSize:13 }}>店舗スタッフにスキャンしてもらってください</div>
            </div>
            <div style={{ display:"flex",justifyContent:"center",marginBottom:16 }}>
              <QRDisplay shiftId={shift.id} studentId={user.id} />
            </div>
            <button className="btn btn-ghost" style={{ width:"100%",marginTop:8 }} onClick={()=>setShowQR(false)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CHAT SCREEN
// ============================================================
function ChatScreen({ shift, user, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    api.getMessages(shift.id).then(setMessages);
    const sub = api.subscribeToMessages(shift.id, msg => setMessages(p=>[...p,msg]));
    return () => sub.unsubscribe();
  }, [shift.id]);

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    const msg = await api.sendMessage(shift.id, user.id, input.trim());
    if (!USE_SUPABASE) setMessages(p=>[...p,msg]);
    setInput("");
  };

  const formatTime = (t) => {
    try { return new Date(t).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}); } catch { return t; }
  };

  return (
    <div className="app">
      <div className="topbar"><button className="topbar-back" onClick={onBack}>← 戻る</button><div style={{ textAlign:"center" }}><div className="outfit fw-800" style={{ fontSize:15 }}>{shift.store_name}</div><div style={{ fontSize:11,color:"var(--green)" }}>● オンライン</div></div><div style={{ width:60 }}/></div>
      <div style={{ flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:10 }}>
        <div style={{ textAlign:"center",marginBottom:8 }}><span className="badge badge-gray">承認済み · {formatDate(shift.date)}</span></div>
        {messages.map(m=>{
          const mine=m.sender_id===user.id;
          return <div key={m.id} className={`msg ${mine?"mine":"theirs"}`}><div className="msg-bubble">{m.text}</div><div className="msg-time" style={{ textAlign:mine?"right":"left" }}>{formatTime(m.created_at)}</div></div>;
        })}
        <div ref={endRef}/>
      </div>
      <div className="chat-input-bar">
        <input className="chat-input" placeholder="メッセージを入力…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <button className="send-btn" onClick={send}>↑</button>
      </div>
    </div>
  );
}

// ============================================================
// RATING MODAL
// ============================================================
function RatingModal({ student, onClose, onSubmit }) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const labels = ["","😔 もう少し","😐 普通","😊 良い","😄 とても良い","🌟 最高！"];
  return (
    <div className="modal-overlay">
      <div className="modal-sheet">
        <div className="modal-handle"/>
        <div className="outfit fw-800 text-xl" style={{ marginBottom:4 }}>学生を評価する</div>
        <div style={{ color:"var(--gray)",fontSize:13,marginBottom:20 }}>{student.name}さんを5段階で評価してください</div>
        <div className="flex justify-center gap-2" style={{ marginBottom:12 }}>
          {[1,2,3,4,5].map(s=><button key={s} className="star-input" onClick={()=>setScore(s)}>{s<=score?"⭐":"☆"}</button>)}
        </div>
        {score>0&&<div style={{ textAlign:"center",marginBottom:16,fontSize:15,fontWeight:700,color:"var(--amber)" }}>{labels[score]}</div>}
        <div className="input-group" style={{ marginBottom:16 }}>
          <label className="input-label">コメント（任意）</label>
          <textarea className="input" rows={3} placeholder="仕事ぶりについてコメント…" value={comment} onChange={e=>setComment(e.target.value)}/>
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose}>キャンセル</button>
          <button className="btn btn-amber" style={{ flex:2 }} onClick={()=>onSubmit(score,comment)}>評価を送信 ⭐</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CREATE SHIFT
// ============================================================
function CreateShiftScreen({ onBack, onCreate }) {
  const [form, setForm] = useState({ date:today,start_time:"17:00",end_time:"22:00",wage:"1200",slots:"2",description:"",tasks:"" });
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const earnings=form.start_time&&form.end_time&&form.wage?calcWage(form.start_time,form.end_time,parseInt(form.wage)||0):0;
  return (
    <div className="app">
      <div className="topbar"><button className="topbar-back" onClick={onBack}>← 戻る</button><div className="topbar-title">シフト作成</div><div style={{ width:60 }}/></div>
      <div className="scroll-area px-5 pb-24 pt-4">
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
            <div className="stat-box"><div className="stat-num" style={{ fontSize:16 }}>¥{parseInt(form.wage||0).toLocaleString()}</div><div className="stat-label">時給</div></div>
            <div className="stat-box"><div className="stat-num" style={{ fontSize:16 }}>{form.slots}名</div><div className="stat-label">募集</div></div>
            <div className="stat-box"><div className="stat-num" style={{ fontSize:16 }}>¥{earnings.toLocaleString()}</div><div className="stat-label">想定収入</div></div>
          </div>
          <div className="input-group"><label className="input-label">勤務日</label><input className="input" type="date" value={form.date} onChange={e=>upd("date",e.target.value)}/></div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div className="input-group"><label className="input-label">開始時間</label><input className="input" type="time" value={form.start_time} onChange={e=>upd("start_time",e.target.value)}/></div>
            <div className="input-group"><label className="input-label">終了時間</label><input className="input" type="time" value={form.end_time} onChange={e=>upd("end_time",e.target.value)}/></div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div className="input-group"><label className="input-label">時給 (円)</label><input className="input" type="number" value={form.wage} onChange={e=>upd("wage",e.target.value)} min="1000" step="50"/></div>
            <div className="input-group"><label className="input-label">募集人数</label><input className="input" type="number" value={form.slots} onChange={e=>upd("slots",e.target.value)} min="1" max="10"/></div>
          </div>
          <div className="input-group"><label className="input-label">仕事内容</label><textarea className="input" rows={3} placeholder="例：ホールスタッフ。接客・料理提供。まかない付き！" value={form.description} onChange={e=>upd("description",e.target.value)}/></div>
          <div className="input-group"><label className="input-label">作業タグ (カンマ区切り)</label><input className="input" type="text" placeholder="例：接客, 洗い場, 調理補助" value={form.tasks} onChange={e=>upd("tasks",e.target.value)}/></div>
          <div style={{ background:"rgba(79,195,247,0.07)",border:"1px solid rgba(79,195,247,0.14)",borderRadius:14,padding:"12px 16px" }}>
            <div style={{ fontSize:12,color:"var(--blue)",fontWeight:700,marginBottom:4 }}>💡 マッチング範囲</div>
            <div style={{ fontSize:13,color:"var(--gray)" }}>店舗から半径3km以内の大学生に表示されます</div>
          </div>
          <button className="btn btn-amber" style={{ marginTop:4 }} onClick={()=>onCreate(form)}>シフトを公開する 🚀</button>
        </div>
      </div>
    </div>
  );
}
// ============================================================
// STORE SHIFT MANAGE (with QR Scanner)
// ============================================================
function StoreShiftManage({ shift, onBack, onApprove, onComplete, onRate, showToast }) {
  const [tab, setTab] = useState("応募者");
  const [showScanner, setShowScanner] = useState(false);
  // ✅ これに変更（Supabaseから取得）
const [applicants, setApplicants] = useState([]);
useEffect(() => {
  if (!supabase) return;
  supabase.from("applications")
    .select("*, users(*)")
    .eq("shift_id", shift.id)
    .then(({ data }) => setApplicants(data?.map(a => a.users) ?? []));
}, [shift.id]);

  const handleScanResult = async (token) => {
    setShowScanner(false);
    const result = await api.verifyQRToken(token);
    if (result.valid) {
      showToast(result.message);
    } else {
      showToast(result.message, "error");
    }
  };

  return (
    <div className="app">
      {showScanner && <QRScanner onResult={handleScanResult} onClose={()=>setShowScanner(false)} />}
      <div className="topbar"><button className="topbar-back" onClick={onBack}>← 戻る</button><div className="topbar-title" style={{ fontSize:16 }}>シフト管理</div><div style={{ width:60 }}/></div>
      <div style={{ padding:"12px 16px 8px" }}>
        <div className="card shift-pad">
          <div className="flex justify-between items-center">
            <div><div className="fw-700">{formatDate(shift.date)}</div><div style={{ fontSize:14,color:"var(--gray)" }}>{shift.start_time}〜{shift.end_time}</div></div>
            <div style={{ textAlign:"right" }}><div className="outfit fw-800" style={{ color:"var(--amber)",fontSize:20 }}>¥{shift.wage}</div><div style={{ fontSize:12,color:"var(--gray)" }}>{shift.filled_slots||0}/{shift.slots}名確定</div></div>
          </div>
        </div>

        {/* QR Scan button */}
        <button className="btn btn-amber" style={{ width:"100%",marginTop:12,borderRadius:12 }} onClick={()=>setShowScanner(true)}>
          📷 学生のQRをスキャンする
        </button>

        <div className="tabs" style={{ margin:"12px 0 0" }}>
          {["応募者","勤務中","完了"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>)}
        </div>
      </div>
      <div className="scroll-area pb-24 px-4 pt-3">
        {tab==="応募者"&&(applicants.length===0
          ?<div style={{ textAlign:"center",padding:"48px 0",color:"var(--gray)" }}><div style={{ fontSize:48,marginBottom:12 }}>👀</div><div>まだ応募者がいません</div></div>
          :applicants.map(s=>(
            <div key={s.id} className="card shift-pad" style={{ marginBottom:10 }}>
              <div className="flex items-center gap-3" style={{ marginBottom:12 }}>
                <div className="avatar">{s.avatar}</div>
                <div style={{ flex:1 }}><div className="fw-700">{s.name}</div><div style={{ fontSize:12,color:"var(--gray)" }}>{s.university}</div></div>
                <div className="trust-ring">{s.trust_score}</div>
              </div>
              <div className="flex" style={{ gap:6,flexWrap:"wrap",marginBottom:12 }}>{s.skills?.map(sk=><span key={sk} className="badge badge-amber">{sk}</span>)}</div>
              <div style={{ fontSize:13,color:"var(--gray)",marginBottom:12 }}>{s.bio}</div>
              <div style={{ display:"flex",gap:8 }}>
                <button className="btn btn-danger btn-sm" style={{ flex:1 }}>見送る</button>
                <button className="btn btn-amber btn-sm" style={{ flex:2 }} onClick={()=>onApprove(s)}>承認する ✓</button>
              </div>
            </div>
          ))
        )}
        {tab==="勤務中"&&<div style={{ textAlign:"center",padding:"48px 0",color:"var(--gray)" }}><div style={{ fontSize:48,marginBottom:16 }}>🏃</div><div style={{ marginBottom:8,fontWeight:700 }}>学生が勤務中です</div><div style={{ fontSize:13,marginBottom:20 }}>終了時に「勤務終了を承認」してください</div><button className="btn btn-success" style={{ margin:"0 auto" }} onClick={onComplete}>勤務終了を承認</button></div>}
        {tab==="完了"&&<div style={{ textAlign:"center",padding:"48px 0",color:"var(--gray)" }}><div style={{ fontSize:48,marginBottom:16 }}>✅</div><div style={{ marginBottom:20 }}>勤務が完了しました</div><button className="btn btn-amber" style={{ margin:"0 auto" }} onClick={onRate}>⭐ 学生を評価する</button></div>}
      </div>
    </div>
  );
}
// ============================================================
// STUDENT HOME
// ============================================================
function StudentHome({ user, shifts, applications, onShiftClick, onChatClick }) {
  const [filter, setFilter] = useState("今日");
  const todayShifts = shifts.filter(s=>s.date===today&&s.status==="open");
  const upcoming = shifts.filter(s=>s.date>today&&s.status==="open");
  const shown = filter==="今日"?todayShifts:upcoming;
  const getApp=(sid)=>applications.find(a=>a.shift_id===sid&&a.student_id===user.id);
  const approvedShift = applications.find(a=>a.status==="approved");
  const approvedShiftData = approvedShift ? shifts.find(s=>s.id===approvedShift.shift_id) : null;

  return (
    <div className="scroll-area pb-24">
      <div className="px-5" style={{ paddingTop:20,paddingBottom:16 }}>
        <div style={{ color:"var(--gray)",fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",fontFamily:"Outfit,sans-serif" }}>{new Date().toLocaleDateString("ja-JP",{month:"long",day:"numeric",weekday:"long"})}</div>
        <div className="outfit fw-900 text-2xl" style={{ marginTop:4 }}>こんにちは、{user.name?.split(" ")[0]}さん 👋</div>
      </div>
      <div className="px-5 pb-4">
        <div className="flex gap-3">
          <div className="stat-box"><div className="stat-num">{user.trust_score||4.0}</div><div className="stat-label">信頼スコア</div></div>
          <div className="stat-box"><div className="stat-num">{applications.length}</div><div className="stat-label">応募中</div></div>
          <div className="stat-box"><div className="stat-num">{user.total_shifts||0}</div><div className="stat-label">勤務回数</div></div>
        </div>
      </div>
      {approvedShiftData&&(
        <div style={{ padding:"0 16px 16px" }}>
          <div style={{ background:"linear-gradient(135deg,rgba(93,219,111,0.1),rgba(93,219,111,0.04))",border:"1px solid rgba(93,219,111,0.22)",borderRadius:18,padding:"16px" }}>
            <div className="flex items-center gap-2" style={{ marginBottom:8 }}><span>🎉</span><div className="outfit fw-800 text-green">本日の承認済みシフト</div></div>
            <div className="outfit fw-800" style={{ marginBottom:4,fontSize:16 }}>{approvedShiftData.store_name}</div>
            <div style={{ color:"var(--gray)",fontSize:13,marginBottom:14 }}>本日 {approvedShiftData.start_time} 〜 {approvedShiftData.end_time}</div>
            <div className="flex gap-2">
              <button className="btn btn-success btn-sm" style={{ flex:1 }} onClick={()=>onChatClick(approvedShiftData)}>💬 チャット</button>
              <button className="btn btn-amber btn-sm" style={{ flex:1 }} onClick={()=>onShiftClick(approvedShiftData)}>📱 QR表示</button>
            </div>
          </div>
        </div>
      )}
      <div className="section-header">
        <div className="section-title">募集一覧</div>
        <div style={{ display:"flex",gap:6 }}>
          {["今日","近日"].map(f=><button key={f} className={`tab ${filter===f?"active":""}`} style={{ padding:"6px 14px",flex:"none",borderRadius:99,fontSize:12 }} onClick={()=>setFilter(f)}>{f}</button>)}
        </div>
      </div>
      <div style={{ padding:"0 16px" }}>
        {shown.length===0
          ?<div style={{ textAlign:"center",padding:"48px 0",color:"var(--gray)" }}><div style={{ fontSize:48,marginBottom:12 }}>📭</div><div>現在の募集はありません</div></div>
          :shown.map(shift=>{
            const app=getApp(shift.id);
            return (
              <div key={shift.id} className="card card-hover" style={{ marginBottom:10 }} onClick={()=>onShiftClick(shift)}>
                <div className="shift-pad">
                  <div className="flex justify-between items-center" style={{ marginBottom:10 }}>
                    <div className="flex items-center gap-2">
                      <div className="avatar">{shift.store_avatar}</div>
                      <div><div className="fw-700" style={{ fontSize:14 }}>{shift.store_name}</div><div style={{ fontSize:12,color:"var(--gray)" }}>📍 {shift.distance}km</div></div>
                    </div>
                    {app?.status==="approved"&&<span className="badge badge-green">承認済</span>}
                    {app?.status==="pending"&&<span className="badge badge-amber">審査中</span>}
                    {!app&&<span className="badge badge-amber">募集中</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="outfit fw-900" style={{ fontSize:22,color:"var(--amber)" }}>¥{shift.wage}<span style={{ fontSize:12,color:"var(--gray)",fontFamily:"Noto Sans JP,sans-serif",fontWeight:500 }}>/h</span></div>
                      <div style={{ fontSize:13,color:"var(--gray)" }}>{shift.start_time}〜{shift.end_time} · {shift.slots-(shift.filled_slots||0)}名募集</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:12,color:"var(--gray)" }}>想定収入</div>
                      <div className="outfit fw-800" style={{ fontSize:18 }}>¥{calcWage(shift.start_time,shift.end_time,shift.wage).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ============================================================
// NOTIFICATION
// ============================================================
function NotificationScreen() {
  const notifs = [
    { icon:"✅",title:"応募が承認されました",body:"炉端焼き 北の大地 の本日シフトが承認されました！",time:"10分前",unread:true },
    { icon:"👋",title:"新着メッセージ",body:"炉端焼き 北の大地：「当日は裏口から入ってください」",time:"32分前",unread:true },
    { icon:"⭐",title:"評価を受け取りました",body:"麺屋 凛からの評価：⭐⭐⭐⭐ 「丁寧な対応でした」",time:"昨日",unread:false },
  ];
  return (
    <div className="scroll-area pb-24">
      <div style={{ padding:"24px 20px 16px" }}><div className="outfit fw-900 text-xl">通知</div></div>
      {notifs.map((n,i)=>(
        <div key={i} style={{ display:"flex",gap:14,padding:"16px 20px",background:n.unread?"rgba(255,149,0,0.04)":"transparent",borderBottom:"1px solid var(--border)" }}>
          <div style={{ fontSize:28,flexShrink:0 }}>{n.icon}</div>
          <div style={{ flex:1 }}>
            <div className="flex justify-between" style={{ marginBottom:2 }}>
              <div className="fw-700" style={{ fontSize:14 }}>{n.title}</div>
              {n.unread&&<div style={{ width:8,height:8,borderRadius:"50%",background:"var(--amber)",flexShrink:0,marginTop:6 }}/>}
            </div>
            <div style={{ fontSize:13,color:"var(--gray)",lineHeight:1.5,marginBottom:4 }}>{n.body}</div>
            <div style={{ fontSize:11,color:"var(--gray2)" }}>{n.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// STUDENT PROFILE + SETTINGS
// ============================================================
function StudentProfile({ user, onLogout, onShowTutorial }) {
  return (
    <div className="scroll-area pb-24">
      <div style={{ padding:"24px 20px 0" }}><div className="outfit fw-900 text-xl">プロフィール</div></div>
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 20px" }}>
        <div style={{ fontSize:64,marginBottom:12 }}>{user.avatar||"🧑‍🎓"}</div>
        <div className="outfit fw-800 text-xl">{user.name}</div>
        <div style={{ color:"var(--gray)",fontSize:14,marginBottom:8 }}>{user.university||"東京大学"}</div>
        <span className="badge badge-amber" style={{ fontSize:12,marginBottom:16 }}>🥇 ゴールドランク</span>
        <div className="flex items-center gap-4"><div className="trust-ring">{user.trust_score||4.0}</div><div><div className="fw-700">信頼スコア</div><div style={{ fontSize:13,color:"var(--gray)" }}>勤務{user.total_shifts||0}回</div></div></div>
      </div>
      <div className="px-5">
        <div className="card-glow" style={{ padding:"16px",marginBottom:16 }}>
          <div className="flex justify-between items-center" style={{ marginBottom:10 }}>
            <div><div style={{ fontSize:12,color:"var(--gray)",marginBottom:2 }}>現在のランク</div><div className="outfit fw-800">🥇 ゴールド</div></div>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:12,color:"var(--gray)",marginBottom:2 }}>次のランクまで</div><div className="outfit fw-800 text-amber">💎 ダイヤ</div></div>
          </div>
          <div style={{ background:"var(--bg3)",borderRadius:99,height:8,overflow:"hidden" }}>
            <div style={{ background:"linear-gradient(90deg,#FF9500,#FFBC00)",width:"78%",height:"100%",borderRadius:99,boxShadow:"0 0 10px rgba(255,149,0,0.6)" }}/>
          </div>
          <div style={{ fontSize:11,color:"var(--gray)",marginTop:6,textAlign:"right" }}>スコア {user.trust_score||4.7} → 4.8 到達で昇格</div>
        </div>
        <div className="section-title" style={{ marginBottom:0,marginTop:8 }}>設定</div>
      </div>
      <div style={{ marginTop:12 }}>
        <div className="settings-row" onClick={onShowTutorial}>
          <div className="settings-icon" style={{ background:"rgba(255,149,0,0.12)" }}>📖</div>
          <div style={{ flex:1 }}><div className="fw-600">使い方ガイド</div><div style={{ fontSize:12,color:"var(--gray)" }}>チュートリアルをもう一度見る</div></div>
          <div style={{ color:"var(--gray)" }}>›</div>
        </div>
        <div className="settings-row" onClick={onShowTutorial}>
          <div className="settings-icon" style={{ background:"rgba(93,219,111,0.12)" }}>⭐</div>
          <div style={{ flex:1 }}><div className="fw-600">信頼スコアの仕組み</div><div style={{ fontSize:12,color:"var(--gray)" }}>スコア・ランク制度を確認する</div></div>
          <div style={{ color:"var(--gray)" }}>›</div>
        </div>
        <div className="settings-row">
          <div className="settings-icon" style={{ background:"rgba(79,195,247,0.12)" }}>🔔</div>
          <div style={{ flex:1 }}><div className="fw-600">通知設定</div></div>
          <div style={{ color:"var(--amber)",fontSize:13,fontWeight:700 }}>ON</div>
        </div>
        <div className="settings-row" onClick={onLogout}>
          <div className="settings-icon" style={{ background:"rgba(255,107,107,0.12)" }}>🚪</div>
          <div style={{ flex:1 }}><div className="fw-600 text-red">ログアウト</div></div>
          <div style={{ color:"var(--gray)" }}>›</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STORE HOME
// ============================================================
function StoreHome({ user, shifts, onCreateShift, onManageShift }) {
  const myShifts = shifts.filter(s=>s.store_id===user.id);
  const todayShifts = myShifts.filter(s=>s.date===today);
  const upcoming = myShifts.filter(s=>s.date>today);
  return (
    <div className="scroll-area pb-24">
      <div className="px-5" style={{ paddingTop:20,paddingBottom:12 }}>
        <div style={{ color:"var(--gray)",fontSize:11,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",fontFamily:"Outfit,sans-serif" }}>店舗管理</div>
        <div className="outfit fw-900 text-xl" style={{ marginTop:4 }}>{user.name}</div>
      </div>
      <button className="big-create-btn" onClick={onCreateShift}>
        <div><div className="outfit fw-900" style={{ fontSize:22,marginBottom:4,color:"#1a1000" }}>シフトを作成する</div><div style={{ fontSize:13,color:"rgba(26,16,0,0.6)",fontWeight:600 }}>近隣学生に今すぐ募集を届ける 📍3km以内</div></div>
        <div style={{ fontSize:52,lineHeight:1 }}>＋</div>
      </button>
      <div className="px-5 pb-4">
        <div className="flex gap-3">
          <div className="stat-box"><div className="stat-num">{myShifts.length}</div><div className="stat-label">総シフト</div></div>
          <div className="stat-box"><div className="stat-num">{myShifts.reduce((a,s)=>a+(s.applicants?.length||0),0)}</div><div className="stat-label">応募者数</div></div>
          <div className="stat-box"><div className="stat-num">4.6</div><div className="stat-label">店舗評価</div></div>
        </div>
      </div>
      {todayShifts.length>0&&<div>
        <div className="section-header"><div className="section-title">本日のシフト</div><span className="badge badge-amber">{todayShifts.length}件</span></div>
        <div style={{ padding:"0 16px" }}>
          {todayShifts.map(shift=>(
            <div key={shift.id} className="card card-hover" style={{ marginBottom:10 }} onClick={()=>onManageShift(shift)}>
              <div className="shift-pad">
                <div className="flex justify-between items-center" style={{ marginBottom:(shift.applicants?.length||0)>0?10:0 }}>
                  <div><div className="fw-700">{shift.start_time}〜{shift.end_time}</div><div style={{ fontSize:13,color:"var(--gray)" }}>¥{shift.wage}/h · {shift.slots}名募集</div></div>
                  <div style={{ textAlign:"right" }}><div className="badge badge-amber" style={{ marginBottom:4 }}>{shift.applicants?.length||0}名応募</div><div style={{ fontSize:11,color:"var(--gray)" }}>タップで管理</div></div>
                </div>
                {(shift.applicants?.length||0)>0&&<div style={{ background:"var(--amber-dim)",borderRadius:10,padding:"8px 12px" }}><div style={{ fontSize:12,color:"var(--amber)",fontWeight:700 }}>🔔 応募者を確認してください</div></div>}
              </div>
            </div>
          ))}
        </div>
      </div>}
      {upcoming.length>0&&<div>
        <div className="section-header"><div className="section-title">今後のシフト</div></div>
        <div style={{ padding:"0 16px" }}>
          {upcoming.map(shift=>(
            <div key={shift.id} className="card card-hover" style={{ marginBottom:10 }} onClick={()=>onManageShift(shift)}>
              <div className="shift-pad">
                <div className="flex justify-between items-center">
                  <div><div className="fw-700">{formatDate(shift.date)}</div><div style={{ fontSize:13,color:"var(--gray)" }}>{shift.start_time}〜{shift.end_time} · ¥{shift.wage}/h</div></div>
                  <div className="badge badge-green">募集中</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>}
      {myShifts.length===0&&<div style={{ textAlign:"center",padding:"40px 20px",color:"var(--gray)" }}><div style={{ fontSize:48,marginBottom:12 }}>📋</div><div style={{ marginBottom:8 }}>まだシフトがありません</div><div style={{ fontSize:13 }}>上のボタンから最初のシフトを作成しましょう</div></div>}
    </div>
  );
}

// ============================================================
// STORE PROFILE + SETTINGS
// ============================================================
function StoreProfile({ user, onLogout, onShowTutorial }) {
  return (
    <div className="scroll-area pb-24">
      <div style={{ padding:"24px 20px 0" }}><div className="outfit fw-900 text-xl">店舗プロフィール</div></div>
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 20px" }}>
        <div style={{ fontSize:64,marginBottom:12 }}>{user.avatar||"🏪"}</div>
        <div className="outfit fw-800 text-xl">{user.name}</div>
        <div style={{ color:"var(--gray)",fontSize:14,marginBottom:4 }}>東京都文京区本郷2-1-1</div>
        <span className="badge badge-green" style={{ marginBottom:16,fontSize:12 }}>✓ 審査済み</span>
      </div>
      <div className="px-5">
        <div className="flex gap-3" style={{ marginBottom:16 }}>
          <div className="stat-box"><div className="stat-num">¥14,000</div><div className="stat-label">今月支払い</div></div>
          <div className="stat-box"><div className="stat-num">28</div><div className="stat-label">マッチ数</div></div>
        </div>
        <div className="section-title" style={{ marginBottom:0,marginTop:8 }}>設定</div>
      </div>
      <div style={{ marginTop:12 }}>
        <div className="settings-row" onClick={onShowTutorial}>
          <div className="settings-icon" style={{ background:"rgba(255,149,0,0.12)" }}>📖</div>
          <div style={{ flex:1 }}><div className="fw-600">使い方ガイド</div><div style={{ fontSize:12,color:"var(--gray)" }}>チュートリアルをもう一度見る</div></div>
          <div style={{ color:"var(--gray)" }}>›</div>
        </div>
        <div className="settings-row" onClick={onShowTutorial}>
          <div className="settings-icon" style={{ background:"rgba(93,219,111,0.12)" }}>💰</div>
          <div style={{ flex:1 }}><div className="fw-600">料金プランを確認</div><div style={{ fontSize:12,color:"var(--gray)" }}>課金の仕組みを見る</div></div>
          <div style={{ color:"var(--gray)" }}>›</div>
        </div>
        <div className="settings-row">
          <div className="settings-icon" style={{ background:"rgba(79,195,247,0.12)" }}>🔔</div>
          <div style={{ flex:1 }}><div className="fw-600">通知設定</div></div>
          <div style={{ color:"var(--amber)",fontSize:13,fontWeight:700 }}>ON</div>
        </div>
        <div className="settings-row" onClick={onLogout}>
          <div className="settings-icon" style={{ background:"rgba(255,107,107,0.12)" }}>🚪</div>
          <div style={{ flex:1 }}><div className="fw-600 text-red">ログアウト</div></div>
          <div style={{ color:"var(--gray)" }}>›</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  useEffect(()=>{ injectStyles(); },[]);

  const [user, setUser] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialFromSettings, setTutorialFromSettings] = useState(false);
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState(null);
  const [toast, setToast] = useState(null);
  const [toastType, setToastType] = useState("ok");
  const [shifts, setShifts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [ratingTarget, setRatingTarget] = useState(null);

  const showToast = (msg, type="ok") => { setToast(msg); setToastType(type); };
  const goScreen = (type,data={}) => setScreen({type,data});
  const goBack = () => setScreen(null);

  // Load data on user change
  useEffect(() => {
    if (!user) return;
    api.getShifts().then(setShifts);
    if (user.type==="student") api.getApplications(user.id).then(setApplications);
  }, [user]);

  const handleLogin = (u) => { setPendingUser(u); setShowTutorial(true); setTutorialFromSettings(false); };
  const handleTutorialFinish = () => { setShowTutorial(false); if(pendingUser){ setUser(pendingUser); setPendingUser(null); setTab("home"); } };
  const handleShowTutorial = () => { setTutorialFromSettings(true); setShowTutorial(true); };
  const handleTutorialClose = () => { setShowTutorial(false); setTutorialFromSettings(false); };

  if (showTutorial) {
    const role=(pendingUser||user)?.type||"student";
    return <TutorialScreen role={role} fromSettings={tutorialFromSettings} onFinish={tutorialFromSettings?handleTutorialClose:handleTutorialFinish}/>;
  }
  if (!user) return <AuthScreen onLogin={handleLogin}/>;

  const handleApply = async (shift) => {
    if (applications.find(a=>a.shift_id===shift.id&&a.student_id===user.id)) return;
    const app = await api.applyShift(shift.id, user.id);
    setApplications(prev=>[...prev,app]);
    showToast("応募しました！審査をお待ちください");
    goBack();
  };

  const handleCreateShift = (form) => {
    const newShift = { id:`sh${Date.now()}`,store_id:user.id,store_name:user.name,store_avatar:"🏪",date:form.date,start_time:form.start_time,end_time:form.end_time,wage:parseInt(form.wage),slots:parseInt(form.slots),filled_slots:0,description:form.description||"詳細は後ほど記載します",tasks:form.tasks?form.tasks.split(",").map(t=>t.trim()):[],status:"open",applicants:[],distance:0 };
    setShifts(prev=>[...prev,newShift]);
    showToast("シフトを公開しました！");
    goBack();
  };

  if (screen) {
    if (screen.type==="shiftDetail") {
      const app=applications.find(a=>a.shift_id===screen.data.id&&a.student_id===user.id);
      return <ShiftDetail shift={screen.data} user={user} onBack={goBack} onApply={()=>handleApply(screen.data)} onChat={()=>goScreen("chat",screen.data)} appStatus={app?.status}/>;
    }
    if (screen.type==="chat") return <ChatScreen shift={screen.data} user={user} onBack={goBack}/>;
    if (screen.type==="createShift") return <CreateShiftScreen onBack={goBack} onCreate={handleCreateShift}/>;
    if (screen.type==="manageShift") return (
      <StoreShiftManage shift={screen.data} onBack={goBack}
        onApprove={(s)=>{ showToast(`${s.name}さんを承認しました！`); goBack(); }}
        onComplete={()=>showToast("勤務完了を承認しました")}
        onRate={()=>{ setRatingTarget(MOCK_STUDENTS[0]); goBack(); }}
        showToast={showToast}
      />
    );
  }

  const studentNav=[{id:"home",icon:"🏠",label:"ホーム"},{id:"notif",icon:"🔔",label:"通知",badge:2},{id:"profile",icon:"👤",label:"マイページ"}];
  const storeNav=[{id:"home",icon:"🏠",label:"ホーム"},{id:"notif",icon:"🔔",label:"通知",badge:1},{id:"profile",icon:"🏪",label:"店舗"}];
  const navItems=user.type==="student"?studentNav:storeNav;

  const renderTab=()=>{
    if(user.type==="student"){
      if(tab==="home") return <StudentHome user={user} shifts={shifts} applications={applications} onShiftClick={s=>goScreen("shiftDetail",s)} onChatClick={s=>goScreen("chat",s)}/>;
      if(tab==="notif") return <NotificationScreen/>;
      if(tab==="profile") return <StudentProfile user={user} onLogout={()=>setUser(null)} onShowTutorial={handleShowTutorial}/>;
    } else {
      if(tab==="home") return <StoreHome user={user} shifts={shifts} onCreateShift={()=>goScreen("createShift")} onManageShift={s=>goScreen("manageShift",s)}/>;
      if(tab==="notif") return <NotificationScreen/>;
      if(tab==="profile") return <StoreProfile user={user} onLogout={()=>setUser(null)} onShowTutorial={handleShowTutorial}/>;
    }
  };

  return (
    <div className="app">
      {toast&&<Toast msg={toast} type={toastType} onDone={()=>setToast(null)}/>}
      {ratingTarget&&<RatingModal student={ratingTarget} onClose={()=>setRatingTarget(null)} onSubmit={()=>{ setRatingTarget(null); showToast("評価を送信しました！ありがとうございます"); }}/>}
      <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>{renderTab()}</div>
      <nav className="bottom-nav">
        {navItems.map(item=>(
          <button key={item.id} className={`nav-btn ${tab===item.id?"active":""}`} onClick={()=>setTab(item.id)}>
            <div className="relative">
              <span className="nav-icon">{item.icon}</span>
              {item.badge&&tab!==item.id&&<div className="nav-dot"/>}
            </div>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}