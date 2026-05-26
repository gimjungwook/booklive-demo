(function () {
  "use strict";

  var AUTHOR_ID = 3;
  var AUTHOR_NAME = "이정효";
  var BOOK_TITLE = "정답은 있다";

  var DEFAULT_QUICK = [
    "이 책의 핵심은요?",
    "감독님 철학은?",
    "선수 동기부여 비결",
    "후반 집중력 노하우"
  ];

  var params = new URLSearchParams(location.search);
  var API_BASE = (params.get("api") || localStorage.getItem("booklive_api") || "").replace(/\/+$/, "");
  if (params.get("api")) {
    localStorage.setItem("booklive_api", API_BASE);
  }

  var chatEl = document.getElementById("chat");
  var quickEl = document.getElementById("quick");
  var formEl = document.getElementById("form");
  var inputEl = document.getElementById("input");
  var sendEl = document.getElementById("send");
  var bannerEl = document.getElementById("config-banner");

  if (!API_BASE) {
    bannerEl.hidden = false;
  }

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
    bubble.textContent = text;

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

    if (side === "them" && opts.sources && opts.sources.length > 0) {
      var seen = {};
      var uniqueSources = [];
      opts.sources.forEach(function (s) {
        if (!s || !s.chapter || seen[s.chapter]) return;
        seen[s.chapter] = true;
        uniqueSources.push(s);
      });
      if (uniqueSources.length > 0) {
        var src = document.createElement("div");
        src.className = "sources";
        var icon = document.createElement("span");
        icon.className = "sources-icon";
        icon.textContent = "📖";
        src.appendChild(icon);
        uniqueSources.forEach(function (s, i) {
          if (i > 0) src.appendChild(document.createTextNode(" "));
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "source-chip";
          chip.textContent = s.chapter;
          chip.addEventListener("click", function () {
            openSourceModal(s);
          });
          src.appendChild(chip);
        });
        inner.appendChild(src);
      }
    }

    wrap.appendChild(inner);
    chatEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
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
    if (!items || items.length === 0) {
      quickEl.hidden = true;
      return;
    }
    items.forEach(function (q) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = q;
      btn.addEventListener("click", function () {
        sendMessage(q);
      });
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
    } catch (e) {
      console.warn("recommended-questions fetch failed:", e);
    }
    return DEFAULT_QUICK;
  }

  async function callQuery(question) {
    var res = await fetch(API_BASE + "/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        author_id: AUTHOR_ID,
        mode: "conversational"
      })
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
    if (!API_BASE) {
      bannerEl.hidden = false;
      return;
    }
    sending = true;
    inputEl.value = "";
    sendEl.classList.remove("active");
    addMessage("me", text);
    var typing = addTyping();
    try {
      var data = await callQuery(text);
      typing.remove();
      addMessage("them", data.answer || "(빈 응답)", { sources: data.sources });
    } catch (e) {
      typing.remove();
      addMessage("them", "응답을 받지 못했습니다.\n" + e.message);
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

  async function saveChatAsPng() {
    if (!window.html2canvas) {
      alert("이미지 변환 라이브러리 로드 실패. 네트워크를 확인해 주세요.");
      return;
    }
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
    document.body.style.background = "#d5dde4";
    await new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
    var btn = document.getElementById("save-png");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; }
    try {
      var canvas = await window.html2canvas(phone, {
        scale: 2,
        backgroundColor: "#abc1d1",
        useCORS: true,
        logging: false,
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
  if (saveBtn) {
    saveBtn.addEventListener("click", saveChatAsPng);
  }

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
      ? source.text
      : "(본문 미리보기 없음)";
    if (typeof sourceModal.showModal === "function") {
      sourceModal.showModal();
    } else {
      sourceModal.setAttribute("open", "");
    }
  }

  function closeSourceModal() {
    if (!sourceModal) return;
    if (typeof sourceModal.close === "function") {
      sourceModal.close();
    } else {
      sourceModal.removeAttribute("open");
    }
  }

  if (sourceModalClose) {
    sourceModalClose.addEventListener("click", closeSourceModal);
  }
  if (sourceModal) {
    sourceModal.addEventListener("click", function (e) {
      if (e.target === sourceModal) closeSourceModal();
    });
  }

  (async function init() {
    addSystem(new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }));
    addMessage(
      "them",
      "안녕하세요. 수원FC 감독 이정효입니다. \n『" + BOOK_TITLE + "』에 담은 이야기, 무엇이든 물어보세요."
    );
    var quick = await fetchRecommendedQuestions();
    setQuickReplies(quick);
  })();
})();
