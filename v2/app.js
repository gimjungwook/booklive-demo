(function () {
  "use strict";

  var AUTHOR_ID = 3;
  var AUTHOR_NAME = "이정효";
  var BOOK_TITLE = "정답은 있다";
  var BOOK_PRICE = "₩16,800";
  var BOOK_BUY_URL = "https://product.kyobobook.co.kr/search?keyword=" + encodeURIComponent(BOOK_TITLE + " " + AUTHOR_NAME);
  var BOOKMARK_KEY = "booklive_bookmarks_v2";
  var QUOTES_KEY = "booklive_quotes_v2";
  var BOOK_CARD_AFTER_TURN = 3; // 답변 3개 뒤에 책 카드 자동 노출

  var DEFAULT_QUICK = [
    "이 책의 핵심은요?",
    "감독님 철학은?",
    "선수 동기부여 비결",
    "후반 집중력 노하우"
  ];

  var params = new URLSearchParams(location.search);
  var API_BASE = (params.get("api") || localStorage.getItem("booklive_api_v2") || "").replace(/\/+$/, "");
  if (params.get("api")) localStorage.setItem("booklive_api_v2", API_BASE);

  var chatEl = document.getElementById("chat");
  var quickEl = document.getElementById("quick");
  var formEl = document.getElementById("form");
  var inputEl = document.getElementById("input");
  var sendEl = document.getElementById("send");
  var bannerEl = document.getElementById("config-banner");
  var bookmarkCountEl = document.getElementById("bookmark-count");
  var collectionCountEl = document.getElementById("collection-count");

  if (!API_BASE) bannerEl.hidden = false;

  var assistantTurnCount = 0;
  var bookCardShown = false;

  function timeNow() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h < 12 ? "오전" : "오후";
    var hh = h % 12 || 12;
    return ampm + " " + hh + ":" + (m < 10 ? "0" + m : m);
  }

  function addSystem(text) {
    var el = document.createElement("div");
    el.className = "system";
    el.textContent = text;
    chatEl.appendChild(el);
    scrollToBottom();
  }

  function loadBookmarks() {
    try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveBookmarks(list) {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(list));
    refreshBookmarkCount();
  }
  function refreshBookmarkCount() {
    var n = loadBookmarks().length;
    if (n > 0) {
      bookmarkCountEl.textContent = n;
      bookmarkCountEl.hidden = false;
    } else {
      bookmarkCountEl.hidden = true;
    }
  }
  function isBookmarked(id) {
    return loadBookmarks().some(function (b) { return b.id === id; });
  }
  function toggleBookmark(entry) {
    var list = loadBookmarks();
    var idx = list.findIndex(function (b) { return b.id === entry.id; });
    if (idx >= 0) list.splice(idx, 1); else list.unshift(entry);
    saveBookmarks(list);
    return idx < 0;
  }

  // 구절 컬렉션 (인용 카드의 "구절 소장하기")
  function loadQuotes() {
    try { return JSON.parse(localStorage.getItem(QUOTES_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveQuotes(list) {
    localStorage.setItem(QUOTES_KEY, JSON.stringify(list));
    refreshCollectionCount();
  }
  function refreshCollectionCount() {
    var n = loadQuotes().length;
    if (n > 0) {
      collectionCountEl.textContent = n;
      collectionCountEl.hidden = false;
    } else {
      collectionCountEl.hidden = true;
    }
  }
  function quoteId(source) {
    return (source.chapter || "p?") + "::" + (source.text || "").slice(0, 60);
  }
  function isQuoteSaved(source) {
    var id = quoteId(source);
    return loadQuotes().some(function (q) { return q.id === id; });
  }
  function toggleQuote(source) {
    var id = quoteId(source);
    var list = loadQuotes();
    var idx = list.findIndex(function (q) { return q.id === id; });
    if (idx >= 0) list.splice(idx, 1);
    else list.unshift({
      id: id,
      ts: new Date().toISOString(),
      chapter: source.chapter,
      text: source.text
    });
    saveQuotes(list);
    return idx < 0;
  }

  function addMessage(side, text, opts) {
    opts = opts || {};
    var wrap = document.createElement("div");
    wrap.className = "msg " + side;

    var inner = document.createElement("div");
    inner.style.display = "flex";
    inner.style.flexDirection = "column";

    if (side === "them" && opts.showName !== false) {
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = AUTHOR_NAME;
      inner.appendChild(name);
    }

    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "flex-end";
    row.style.gap = "4px";

    var bubble = document.createElement("div");
    bubble.className = "bubble";

    if (side === "them" && window.marked && window.DOMPurify) {
      try {
        var rendered = window.marked.parse(text || "", { breaks: true, gfm: true });
        var sanitized = window.DOMPurify.sanitize(rendered);
        sanitized = sanitized.replace(/\[p\.([0-9]+(?:-[0-9]+)?)\]/g, function (_, pg) {
          return '<button type="button" class="inline-cite" data-chapter="p.' + pg + '">p.' + pg + '</button>';
        });
        bubble.innerHTML = sanitized;
        bubble.classList.add("md");
        if (opts.sources && opts.sources.length > 0) {
          bubble.querySelectorAll("button.inline-cite").forEach(function (btn) {
            var ch = btn.getAttribute("data-chapter");
            var src = opts.sources.find(function (s) { return s && s.chapter === ch; });
            if (src) {
              btn.addEventListener("click", function () { toggleCiteCard(wrap, src); });
            } else {
              btn.disabled = true;
            }
          });
        }
      } catch (e) {
        console.warn("md render failed:", e);
        bubble.textContent = text;
      }
    } else {
      bubble.textContent = text;
    }

    // 북마크 토글 버튼 (them side only, 의미 있는 답변에만)
    if (side === "them" && opts.bookmarkable !== false) {
      var bm = document.createElement("button");
      bm.type = "button";
      bm.className = "bm-toggle";
      bm.setAttribute("aria-label", "북마크");
      bm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
      var entryId = "bm_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      if (isBookmarked(entryId)) bm.classList.add("on");
      bm.addEventListener("click", function () {
        var added = toggleBookmark({
          id: entryId,
          ts: new Date().toISOString(),
          question: opts.question || "",
          answer: text,
          sources: opts.sources || []
        });
        bm.classList.toggle("on", added);
      });
      bubble.appendChild(bm);
    }

    var meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = timeNow();

    if (side === "me") {
      row.appendChild(meta);
      row.appendChild(bubble);
    } else {
      row.appendChild(bubble);
      row.appendChild(meta);
    }
    inner.appendChild(row);

    wrap.appendChild(inner);
    chatEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  // chip 클릭 시 해당 메시지 직후에 인용 카드 토글 (이미 열려있으면 닫음)
  function toggleCiteCard(msgWrap, source) {
    var existing = msgWrap.nextElementSibling;
    if (existing && existing.classList.contains("cite-card") && existing.dataset.chapter === source.chapter) {
      existing.remove();
      return;
    }
    var card = document.createElement("div");
    card.className = "cite-card";
    card.dataset.chapter = source.chapter || "";
    var saved = isQuoteSaved(source);
    card.innerHTML =
      '<div class="head">' +
        '<span class="label">COLLECTION · 이정효의 일침</span>' +
        '<span class="pg">' + (source.chapter || "") + '</span>' +
      '</div>' +
      '<div class="body"></div>' +
      '<div class="actions">' +
        '<button type="button" class="close-card">접기</button>' +
        '<button type="button" class="save-quote' + (saved ? ' saved' : '') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
          '<span class="lbl">' + (saved ? '소장됨' : '구절 소장하기') + '</span>' +
        '</button>' +
      '</div>';
    card.querySelector(".body").textContent = source.text || "(본문 미리보기 없음)";
    card.querySelector(".close-card").addEventListener("click", function () { card.remove(); });
    var saveBtn = card.querySelector(".save-quote");
    var saveLbl = saveBtn.querySelector(".lbl");
    saveBtn.addEventListener("click", function () {
      var added = toggleQuote(source);
      saveBtn.classList.toggle("saved", added);
      saveLbl.textContent = added ? "소장됨" : "구절 소장하기";
    });
    msgWrap.insertAdjacentElement("afterend", card);
    scrollToBottom();
  }

  function addBookCard() {
    if (bookCardShown) return;
    bookCardShown = true;
    var wrap = document.createElement("div");
    wrap.className = "book-card";
    wrap.innerHTML =
      '<div class="cover">정답은<br>있다</div>' +
      '<div class="info">' +
        '<div class="t">' + BOOK_TITLE + '</div>' +
        '<div class="a">' + AUTHOR_NAME + ' · 다산북스</div>' +
        '<div class="p">' + BOOK_PRICE + '</div>' +
      '</div>' +
      '<a class="buy" href="' + BOOK_BUY_URL + '" target="_blank" rel="noopener">구매하기</a>';
    chatEl.appendChild(wrap);
    scrollToBottom();
  }

  function addTyping() {
    var wrap = document.createElement("div");
    wrap.className = "msg them typing";
    wrap.innerHTML =
      '<div style="display:flex;flex-direction:column">' +
      '<div class="name">' + AUTHOR_NAME + "</div>" +
      '<div class="bubble"><span class="dots"><span></span><span></span><span></span></span></div>' +
      "</div>";
    chatEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function scrollToBottom() {
    requestAnimationFrame(function () {
      chatEl.scrollTop = chatEl.scrollHeight;
    });
  }

  function setQuickReplies(items) {
    quickEl.innerHTML = "";
    if (!items || items.length === 0) { quickEl.hidden = true; return; }
    items.slice(0, 4).forEach(function (q) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = q;
      btn.addEventListener("click", function () { sendMessage(q); });
      quickEl.appendChild(btn);
    });
    quickEl.hidden = false;
  }

  async function fetchRecommendedQuestions() {
    if (!API_BASE) return DEFAULT_QUICK;
    try {
      var res = await fetch(API_BASE + "/authors/" + AUTHOR_ID + "/recommended-questions");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        return data.questions;
      }
    } catch (e) { console.warn("recommended fetch failed:", e); }
    return DEFAULT_QUICK;
  }

  async function callQuery(question) {
    var res = await fetch(API_BASE + "/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question, author_id: AUTHOR_ID, mode: "conversational" })
    });
    if (!res.ok) {
      var body = await res.text();
      throw new Error("HTTP " + res.status + ": " + body);
    }
    return await res.json();
  }

  var sending = false;
  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text || sending) return;
    if (!API_BASE) { bannerEl.hidden = false; return; }
    sending = true;
    inputEl.value = "";
    sendEl.classList.remove("active");
    addMessage("me", text);
    var typing = addTyping();
    try {
      var data = await callQuery(text);
      typing.remove();
      addMessage("them", data.answer || "(빈 응답)", {
        sources: data.sources,
        question: text
      });
      assistantTurnCount += 1;
      // N번째 답변 후 책 카드 자동 노출
      if (assistantTurnCount >= BOOK_CARD_AFTER_TURN && !bookCardShown) {
        setTimeout(addBookCard, 400);
      }
    } catch (e) {
      typing.remove();
      addMessage("them", "응답을 받지 못했습니다.\n" + e.message, { bookmarkable: false });
      console.error(e);
    } finally {
      sending = false;
    }
  }

  inputEl.addEventListener("input", function () {
    sendEl.classList.toggle("active", inputEl.value.trim().length > 0);
  });
  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage(inputEl.value);
  });

  // PNG 저장
  async function saveChatAsPng() {
    if (!window.html2canvas) { alert("이미지 변환 라이브러리 로드 실패."); return; }
    var phone = document.querySelector(".phone");
    var chat = document.getElementById("chat");
    var prev = {
      chatOverflow: chat.style.overflow,
      chatMaxHeight: chat.style.maxHeight,
      chatHeight: chat.style.height,
      phoneHeight: phone.style.height,
      bodyBg: document.body.style.background
    };
    chat.style.overflow = "visible";
    chat.style.maxHeight = "none";
    chat.style.height = chat.scrollHeight + "px";
    phone.style.height = "auto";
    document.body.style.background = "#e6e3dc";
    await new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
    var btn = document.getElementById("save-png");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; }
    try {
      var canvas = await window.html2canvas(phone, {
        scale: 2, backgroundColor: "#f0eee9", useCORS: true, logging: false,
        windowHeight: phone.scrollHeight
      });
      var ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      var link = document.createElement("a");
      link.download = "booklive-chat-" + ts + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("PNG 저장 실패: " + (e && e.message ? e.message : e));
    } finally {
      chat.style.overflow = prev.chatOverflow;
      chat.style.maxHeight = prev.chatMaxHeight;
      chat.style.height = prev.chatHeight;
      phone.style.height = prev.phoneHeight;
      document.body.style.background = prev.bodyBg;
      if (btn) { btn.disabled = false; btn.style.opacity = ""; }
    }
  }
  var saveBtn = document.getElementById("save-png");
  if (saveBtn) saveBtn.addEventListener("click", saveChatAsPng);

  // 출처 본문 모달
  var sourceModal = document.getElementById("source-modal");
  var sourceModalTitle = document.getElementById("source-modal-title");
  var sourceModalBody = document.getElementById("source-modal-body");
  var sourceModalClose = document.getElementById("source-modal-close");

  function openSourceModal(source) {
    if (!sourceModal || !source) return;
    var title = source.chapter || "근거";
    if (source.source) title += " · " + source.source;
    sourceModalTitle.textContent = title;
    sourceModalBody.textContent = (source.text && source.text.length > 0)
      ? source.text : "(본문 미리보기 없음)";
    if (typeof sourceModal.showModal === "function") sourceModal.showModal();
    else sourceModal.setAttribute("open", "");
  }
  function closeSourceModal() {
    if (!sourceModal) return;
    if (typeof sourceModal.close === "function") sourceModal.close();
    else sourceModal.removeAttribute("open");
  }
  if (sourceModalClose) sourceModalClose.addEventListener("click", closeSourceModal);
  if (sourceModal) {
    sourceModal.addEventListener("click", function (e) {
      if (e.target === sourceModal) closeSourceModal();
    });
  }

  // 북마크 보기 모달
  var bmModal = document.getElementById("bookmark-modal");
  var bmModalBody = document.getElementById("bookmark-modal-body");
  var bmModalClose = document.getElementById("bookmark-modal-close");
  var bmListBtn = document.getElementById("bookmark-list-btn");

  function renderBookmarks() {
    var list = loadBookmarks();
    bmModalBody.innerHTML = "";
    list.forEach(function (b) {
      var item = document.createElement("div");
      item.className = "item";
      var pages = (b.sources || []).map(function (s) { return s.chapter; }).filter(Boolean);
      var uniq = [];
      pages.forEach(function (p) { if (uniq.indexOf(p) === -1) uniq.push(p); });
      item.innerHTML =
        '<div class="q">Q. ' + escapeHtml(b.question) + '</div>' +
        '<div class="a">' + escapeHtml(b.answer.replace(/\[p\.[0-9-]+\]/g, "").trim()) + '</div>' +
        (uniq.length ? '<div class="pages">📖 ' + uniq.join(", ") + '</div>' : '');
      item.addEventListener("click", function () {
        if (b.sources && b.sources[0]) openSourceModal(b.sources[0]);
      });
      bmModalBody.appendChild(item);
    });
  }
  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }
  function openBookmarkModal() {
    renderBookmarks();
    if (typeof bmModal.showModal === "function") bmModal.showModal();
    else bmModal.setAttribute("open", "");
  }
  function closeBookmarkModal() {
    if (typeof bmModal.close === "function") bmModal.close();
    else bmModal.removeAttribute("open");
  }
  if (bmModalClose) bmModalClose.addEventListener("click", closeBookmarkModal);
  if (bmModal) {
    bmModal.addEventListener("click", function (e) {
      if (e.target === bmModal) closeBookmarkModal();
    });
  }
  if (bmListBtn) bmListBtn.addEventListener("click", openBookmarkModal);

  // 구절 컬렉션 모달
  var colModal = document.getElementById("collection-modal");
  var colModalBody = document.getElementById("collection-modal-body");
  var colModalClose = document.getElementById("collection-modal-close");
  var colBtn = document.getElementById("collection-btn");

  function renderCollection() {
    var list = loadQuotes();
    colModalBody.innerHTML = "";
    list.forEach(function (q) {
      var item = document.createElement("div");
      item.className = "quote-item";
      item.innerHTML =
        '<div class="pg">' + escapeHtml(q.chapter || "p.?") + '</div>' +
        '<div class="qt">' + escapeHtml(q.text || "") + '</div>' +
        '<button type="button" class="rm">제거</button>';
      item.querySelector(".rm").addEventListener("click", function () {
        var arr = loadQuotes().filter(function (x) { return x.id !== q.id; });
        saveQuotes(arr);
        renderCollection();
      });
      colModalBody.appendChild(item);
    });
  }
  function openCollectionModal() {
    renderCollection();
    if (typeof colModal.showModal === "function") colModal.showModal();
    else colModal.setAttribute("open", "");
  }
  function closeCollectionModal() {
    if (typeof colModal.close === "function") colModal.close();
    else colModal.removeAttribute("open");
  }
  if (colModalClose) colModalClose.addEventListener("click", closeCollectionModal);
  if (colModal) {
    colModal.addEventListener("click", function (e) {
      if (e.target === colModal) closeCollectionModal();
    });
  }
  if (colBtn) colBtn.addEventListener("click", openCollectionModal);

  refreshBookmarkCount();
  refreshCollectionCount();

  (async function init() {
    addSystem(new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }));
    addMessage("them",
      "안녕하세요. 수원FC 감독 이정효입니다.\n『" + BOOK_TITLE + "』에 담은 이야기, 무엇이든 물어보세요.",
      { bookmarkable: false }
    );
    var quick = await fetchRecommendedQuestions();
    setQuickReplies(quick);
  })();
})();
