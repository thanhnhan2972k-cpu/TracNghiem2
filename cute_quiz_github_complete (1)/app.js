const state = {
  screen: "loading",
  manifest: { quizzes: [], errors: [] },
  quizzes: new Map(),
  currentQuiz: null,
  currentIndex: 0,
  answers: [],
  secondsLeft: 0,
  timer: null,
  lastResult: null
};

const app = document.getElementById("app");
const bottomNav = document.getElementById("bottomNav");
const backBtn = document.getElementById("backBtn");
const soundBtn = document.getElementById("soundBtn");
const palette = ["#fff0f6","#eef8ff","#effcf7","#fff8e2","#f3efff","#fff0eb"];

function clone(id){ return document.getElementById(id).content.cloneNode(true); }
function escapeHtml(value=""){
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function colorFor(index){ return palette[index % palette.length]; }
function clearTimer(){ if(state.timer){ clearInterval(state.timer); state.timer = null; } }

async function loadManifest(){
  state.screen = "loading";
  render();
  try{
    const res = await fetch("./quizzes/index.json", { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(!data || !Array.isArray(data.quizzes)) throw new Error("index.json không đúng định dạng");
    state.manifest = data;
    state.screen = "home";
    render();
  }catch(err){
    console.error(err);
    state.screen = "error";
    state.loadError = location.protocol === "file:"
      ? "Bạn đang mở file trực tiếp bằng file://. Bản này cần chạy qua GitHub Pages hoặc một web server nhỏ để đọc dữ liệu trong thư mục quizzes."
      : "Không đọc được quizzes/index.json. Hãy kiểm tra GitHub Actions đã build thành công chưa.";
    render();
  }
}

async function getQuiz(meta){
  if(state.quizzes.has(meta.id)) return state.quizzes.get(meta.id);
  const res = await fetch(`./quizzes/${encodeURIComponent(meta.file)}`, { cache: "no-store" });
  if(!res.ok) throw new Error(`Không tải được đề ${meta.title}`);
  const quiz = await res.json();
  if(!Array.isArray(quiz.questions) || !quiz.questions.length) throw new Error("Đề không có câu hỏi hợp lệ");
  state.quizzes.set(meta.id, quiz);
  return quiz;
}

function setScreen(name){
  clearTimer();
  state.screen = name;
  document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.screen === name));
  bottomNav.style.display = ["quiz","result","review","loading","error"].includes(name) ? "none" : "grid";
  backBtn.style.visibility = ["home","library","history","loading","error"].includes(name) ? "hidden" : "visible";
  render();
  window.scrollTo({top:0, behavior:"smooth"});
}

function render(){
  app.innerHTML = "";
  document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.screen === state.screen));
  bottomNav.style.display = ["quiz","result","review","loading","error"].includes(state.screen) ? "none" : "grid";
  backBtn.style.visibility = ["home","library","history","loading","error"].includes(state.screen) ? "hidden" : "visible";

  if(state.screen === "loading") return app.append(clone("loadingTpl"));
  if(state.screen === "error") return renderError();
  if(state.screen === "home") return renderHome();
  if(state.screen === "library") return renderLibrary();
  if(state.screen === "quiz") return renderQuiz();
  if(state.screen === "result") return renderResult();
  if(state.screen === "review") return renderReview();
  if(state.screen === "history") return renderHistory();
}

function renderError(){
  app.append(clone("errorTpl"));
  document.getElementById("errorMessage").textContent = state.loadError || "Đã có lỗi xảy ra.";
  document.getElementById("reloadBtn").onclick = loadManifest;
}

function buildWarning(){
  const host = document.getElementById("buildWarning");
  if(!host || !state.manifest.errors?.length) return;
  const names = state.manifest.errors.map(e => e.file).slice(0,3).join(", ");
  host.innerHTML = `<div class="warning-card">⚠️ Có ${state.manifest.errors.length} file đề chưa build được: ${escapeHtml(names)}${state.manifest.errors.length>3?"…":""}. Xem log GitHub Actions hoặc <b>quizzes/index.json</b>.</div>`;
}

function emptyHtml(text){
  return `<div class="empty">🌱 ${escapeHtml(text)}</div>`;
}

function renderHome(){
  app.append(clone("homeTpl"));
  buildWarning();
  const list = document.getElementById("featuredList");
  const items = state.manifest.quizzes || [];
  if(!items.length){
    list.innerHTML = emptyHtml("Chưa có đề nào. Hãy thêm file vào quiz_sources rồi push lên GitHub.");
    document.querySelector('[data-action="start-latest"]').disabled = true;
    document.querySelector('[data-action="start-latest"]').style.opacity = ".5";
  }else{
    items.slice(0,4).forEach((q,i)=>{
      const c = document.createElement("button");
      c.className = "quiz-card";
      c.innerHTML = `<div class="quiz-icon" style="background:${colorFor(i)}">${escapeHtml(q.icon || "📝")}</div>
        <h3>${escapeHtml(q.title)}</h3><p>${escapeHtml(q.subject || "Trắc nghiệm")}</p>
        <div class="mini-meta"><span>${q.questionCount} câu</span><span>~${Math.max(1, Math.round((q.duration || 300)/60))} phút</span></div>`;
      c.onclick = ()=>startQuiz(q.id);
      list.append(c);
    });
    document.querySelector('[data-action="start-latest"]').onclick = ()=>startQuiz(items[0].id);
  }
  wireJumps();
}

function renderLibrary(){
  app.append(clone("libraryTpl"));
  const list = document.getElementById("quizList");
  const items = state.manifest.quizzes || [];

  function draw(filter=""){
    list.innerHTML = "";
    const found = items.filter(q => `${q.title} ${q.subject || ""}`.toLowerCase().includes(filter.toLowerCase()));
    if(!found.length){ list.innerHTML = emptyHtml(items.length ? "Không tìm thấy đề phù hợp." : "Chưa có đề nào."); return; }
    found.forEach((q,i)=>{
      const c = document.createElement("div");
      c.className = "list-card";
      c.innerHTML = `<div class="list-icon" style="background:${colorFor(i)}">${escapeHtml(q.icon || "📝")}</div>
        <div><h3>${escapeHtml(q.title)}</h3><p>${escapeHtml(q.subject || "Trắc nghiệm")} • ${q.questionCount} câu</p></div>
        <button class="play-btn" aria-label="Làm ${escapeHtml(q.title)}">▶️</button>`;
      c.querySelector("button").onclick = ()=>startQuiz(q.id);
      list.append(c);
    });
  }
  draw();
  document.getElementById("searchInput").addEventListener("input", e=>draw(e.target.value));
}

async function startQuiz(id){
  const meta = state.manifest.quizzes.find(q=>q.id===id);
  if(!meta) return;
  clearTimer();
  app.innerHTML = "";
  app.append(clone("loadingTpl"));
  bottomNav.style.display = "none";
  backBtn.style.visibility = "hidden";
  try{
    const quiz = await getQuiz(meta);
    state.currentQuiz = quiz;
    state.currentIndex = 0;
    state.answers = Array(quiz.questions.length).fill(null);
    state.secondsLeft = Number.isFinite(quiz.duration) ? quiz.duration : 300;
    setScreen("quiz");
  }catch(err){
    console.error(err);
    state.loadError = err.message || "Không tải được đề.";
    setScreen("error");
  }
}

function renderQuiz(){
  const quiz = state.currentQuiz;
  if(!quiz) return setScreen("library");
  app.append(clone("quizTpl"));
  document.getElementById("quizSubject").textContent = quiz.subject || "Trắc nghiệm";
  document.getElementById("quizTitle").textContent = quiz.title;
  buildQuestion();
  updateTimer();
  state.timer = setInterval(()=>{
    state.secondsLeft = Math.max(0, state.secondsLeft - 1);
    updateTimer();
    if(state.secondsLeft <= 0) submitQuiz(true);
  },1000);
}

function buildQuestion(){
  const quiz = state.currentQuiz;
  const item = quiz.questions[state.currentIndex];
  document.getElementById("questionBadge").textContent = `Câu ${state.currentIndex+1}`;
  document.getElementById("questionText").textContent = item.question;
  document.getElementById("progressText").textContent = `Câu ${state.currentIndex+1}/${quiz.questions.length}`;
  document.getElementById("answeredText").textContent = `${state.answers.filter(x=>x!==null).length} đã trả lời`;
  document.getElementById("progressBar").style.width = `${((state.currentIndex+1)/quiz.questions.length)*100}%`;

  const wrap = document.getElementById("answers");
  wrap.innerHTML = "";
  item.options.forEach((ans,i)=>{
    const b = document.createElement("button");
    b.className = "answer-btn" + (state.answers[state.currentIndex]===i ? " selected" : "");
    b.setAttribute("aria-pressed", state.answers[state.currentIndex]===i ? "true" : "false");
    b.innerHTML = `<span class="letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(ans)}</span>`;
    b.onclick = ()=>{ state.answers[state.currentIndex] = i; buildQuestion(); };
    wrap.append(b);
  });

  const dots = document.getElementById("dotNav");
  dots.innerHTML = "";
  quiz.questions.forEach((_,i)=>{
    const d = document.createElement("button");
    d.className = "dot" + (i===state.currentIndex ? " active" : "") + (state.answers[i]!==null ? " done" : "");
    d.setAttribute("aria-label", `Đi đến câu ${i+1}`);
    d.onclick = ()=>{ state.currentIndex = i; buildQuestion(); };
    dots.append(d);
  });

  const prev = document.getElementById("prevBtn");
  prev.disabled = state.currentIndex===0;
  prev.style.opacity = state.currentIndex===0 ? ".45" : "1";
  prev.onclick = ()=>{ if(state.currentIndex>0){ state.currentIndex--; buildQuestion(); } };

  const next = document.getElementById("nextBtn");
  if(state.currentIndex===quiz.questions.length-1){
    next.textContent = "Nộp bài 🎉";
    next.onclick = ()=>submitQuiz(false);
  }else{
    next.textContent = "Câu tiếp →";
    next.onclick = ()=>{ state.currentIndex++; buildQuestion(); };
  }
}

function updateTimer(){
  const m = Math.floor(state.secondsLeft/60).toString().padStart(2,"0");
  const s = (state.secondsLeft%60).toString().padStart(2,"0");
  const el = document.getElementById("timer");
  if(el) el.textContent = `${m}:${s}`;
}

function submitQuiz(timedOut=false){
  clearTimer();
  const quiz = state.currentQuiz;
  const total = quiz.questions.length;
  let correct = 0;
  quiz.questions.forEach((q,i)=>{ if(state.answers[i]===q.correct) correct++; });
  const percent = Math.round(correct/total*100);
  state.lastResult = {
    quiz,
    answers:[...state.answers],
    correct,total,percent,
    score:(correct/total*10).toFixed(1),
    date:new Date().toLocaleString("vi-VN"),
    timedOut
  };

  try{
    const history = JSON.parse(localStorage.getItem("cuteQuizHistory") || "[]");
    history.unshift({title:quiz.title,score:state.lastResult.score,percent,date:state.lastResult.date,icon:quiz.icon || "📝"});
    localStorage.setItem("cuteQuizHistory", JSON.stringify(history.slice(0,20)));
  }catch(e){ console.warn("Không lưu được lịch sử:", e); }

  state.screen = "result";
  render();
}

function renderResult(){
  const r = state.lastResult;
  if(!r) return setScreen("home");
  app.append(clone("resultTpl"));
  document.getElementById("scoreNumber").textContent = r.score;
  document.getElementById("correctCount").textContent = r.correct;
  document.getElementById("wrongCount").textContent = r.total-r.correct;
  document.getElementById("percentScore").textContent = `${r.percent}%`;
  if(r.timedOut) document.getElementById("resultHeading").textContent = "Hết giờ rồi! ⏰";
  document.querySelector(".score-ring").style.background = `conic-gradient(#ff8eb8 0 ${r.percent}%,#f1e8f4 ${r.percent}% 100%)`;
  document.getElementById("reviewBtn").onclick = ()=>setScreen("review");
  document.getElementById("retryBtn").onclick = ()=>startQuiz(r.quiz.id);
}

function renderReview(){
  const r = state.lastResult;
  if(!r) return setScreen("home");
  app.append(clone("reviewTpl"));
  const list = document.getElementById("reviewList");
  r.quiz.questions.forEach((q,i)=>{
    const chosen = r.answers[i];
    const ok = chosen===q.correct;
    const c = document.createElement("div");
    c.className = `review-card ${ok ? "correct" : "wrong"}`;
    const explain = q.explain ? `<div class="explain">💡 ${escapeHtml(q.explain)}</div>` : "";
    c.innerHTML = `<h3>${ok?"✅":"❌"} Câu ${i+1}: ${escapeHtml(q.question)}</h3>
      <div class="review-answer">Bạn chọn: <strong>${chosen===null?"Chưa trả lời":`${String.fromCharCode(65+chosen)}. ${escapeHtml(q.options[chosen])}`}</strong></div>
      <div class="review-answer">Đáp án đúng: <strong>${String.fromCharCode(65+q.correct)}. ${escapeHtml(q.options[q.correct])}</strong></div>
      ${explain}`;
    list.append(c);
  });
  wireJumps();
}

function renderHistory(){
  app.append(clone("historyTpl"));
  const list = document.getElementById("historyList");
  let history = [];
  try{ history = JSON.parse(localStorage.getItem("cuteQuizHistory") || "[]"); }catch(e){}
  if(!history.length){ list.innerHTML = emptyHtml("Chưa có kết quả nào. Làm một bài để bắt đầu nhé!"); return; }
  history.forEach(x=>{
    const c = document.createElement("div");
    c.className = "history-card";
    c.innerHTML = `<div class="history-badge">${escapeHtml(x.icon || "⭐")}</div>
      <div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.date)}</p></div>
      <div class="history-score">${escapeHtml(x.score)}/10</div>`;
    list.append(c);
  });
}

function wireJumps(){
  document.querySelectorAll("[data-screen-jump]").forEach(b=>b.onclick=()=>setScreen(b.dataset.screenJump));
}

document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
backBtn.onclick = ()=>{
  if(state.screen==="quiz") setScreen("library");
  else if(state.screen==="result") setScreen("library");
  else if(state.screen==="review") setScreen("result");
  else setScreen("home");
};
soundBtn.onclick = e => { e.currentTarget.textContent = e.currentTarget.textContent==="🔔" ? "🔕" : "🔔"; };

loadManifest();
