const state = {
  imageDataUrl: "",
  stream: null,
  lastResult: null,
  history: JSON.parse(localStorage.getItem("handwriting-history") || "[]"),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  imageInput: $("#image-input"),
  chooseImage: $("#choose-image"),
  dropZone: $("#drop-zone"),
  previewImage: $("#preview-image"),
  uploadEmpty: $("#upload-empty"),
  cameraFeed: $("#camera-feed"),
  cameraCanvas: $("#camera-canvas"),
  startCamera: $("#start-camera"),
  takePhoto: $("#take-photo"),
  cameraStatus: $("#camera-status"),
  analyzeButton: $("#analyze-button"),
  targetText: $("#target-text"),
  recognizedText: $("#recognized-text"),
  comparisonOutput: $("#comparison-output"),
  scoreBadge: $("#score-badge"),
  feedbackList: $("#feedback-list"),
  saveResult: $("#save-result"),
  exportResult: $("#export-result"),
  studentName: $("#student-name"),
  studentNumber: $("#student-number"),
  teacherNote: $("#teacher-note"),
  historyList: $("#history-list"),
  statCount: $("#stat-count"),
  statAverage: $("#stat-average"),
  statCommon: $("#stat-common"),
};

function setImage(dataUrl) {
  state.imageDataUrl = dataUrl;
  elements.previewImage.src = dataUrl;
  elements.dropZone.classList.add("has-image");
  elements.uploadEmpty.classList.add("hidden");
}

function readFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => setImage(reader.result);
  reader.readAsDataURL(file);
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function demoAnalyze() {
  const target = normalizeText(elements.targetText.value) || "바른 자세로 또박또박 글씨를 씁니다.";
  const chars = [...target];
  const changed = chars.map((char, index) => {
    if (char === " ") return char;
    if (index % 11 === 6) return "□";
    if (index % 17 === 9) return "";
    return char;
  }).join("");

  const uncertainChars = chars.filter((char, index) => char !== " " && index % 7 === 3).slice(0, 5);

  return {
    recognizedText: changed || target,
    uncertainChars,
    readabilityScore: Math.max(68, 96 - uncertainChars.length * 4),
    feedback: [
      "글자 크기가 대체로 일정해요.",
      "받침과 모음 사이 간격을 조금 더 또렷하게 쓰면 좋아요.",
      "종이를 정면에서 찍으면 AI 판독 정확도가 올라갑니다.",
    ],
  };
}

async function analyzeHandwriting() {
  if (!state.imageDataUrl) {
    alert("먼저 글씨 사진을 올리거나 촬영해 주세요.");
    return;
  }

  elements.analyzeButton.textContent = "분석 중";
  elements.analyzeButton.disabled = true;

  try {
    const response = await fetch("/.netlify/functions/analyze-handwriting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: state.imageDataUrl,
        targetText: elements.targetText.value,
      }),
    });

    if (!response.ok) throw new Error("local-demo");
    const result = await response.json();
    renderResult(result);
  } catch {
    renderResult(demoAnalyze());
  } finally {
    elements.analyzeButton.textContent = "AI로 검사하기";
    elements.analyzeButton.disabled = false;
  }
}

function renderResult(result) {
  state.lastResult = result;
  const recognized = normalizeText(result.recognizedText);
  const target = normalizeText(elements.targetText.value);
  elements.recognizedText.textContent = recognized || "판독된 글자가 없습니다.";
  elements.scoreBadge.textContent = `${result.readabilityScore ?? "--"}점`;
  renderComparison(target, recognized, result.uncertainChars || []);
  renderFeedback(result);
}

function renderComparison(target, recognized, uncertainChars) {
  elements.comparisonOutput.innerHTML = "";
  if (!target) {
    elements.comparisonOutput.textContent = "정답 문장을 입력하면 글자별 비교가 표시됩니다.";
    return;
  }

  const targetChars = [...target];
  const recognizedChars = [...recognized];
  targetChars.forEach((char, index) => {
    const token = document.createElement("span");
    const readChar = recognizedChars[index] || "∅";
    token.className = "char-token";
    token.textContent = char === " " ? "띄움" : char;
    token.title = `AI 판독: ${readChar}`;

    if (uncertainChars.includes(char)) {
      token.classList.add("uncertain");
    } else if (char === readChar) {
      token.classList.add("match");
    } else {
      token.classList.add("miss");
    }

    elements.comparisonOutput.appendChild(token);
  });
}

function renderFeedback(result) {
  const target = normalizeText(elements.targetText.value);
  const recognized = normalizeText(result.recognizedText);
  const mismatchCount = [...target].filter((char, index) => char !== [...recognized][index]).length;
  const messages = Array.isArray(result.feedback) ? result.feedback : [result.feedback].filter(Boolean);

  elements.feedbackList.innerHTML = "";
  [
    { text: `다른 글자 또는 빠진 글자: ${target ? mismatchCount : 0}개`, type: mismatchCount > 2 ? "bad" : "good" },
    { text: `불확실한 글자: ${(result.uncertainChars || []).join(", ") || "없음"}`, type: (result.uncertainChars || []).length ? "warn" : "good" },
    ...messages.map((text) => ({ text, type: "good" })),
  ].forEach((item) => {
    const node = document.createElement("div");
    node.className = `feedback-item ${item.type}`;
    node.textContent = item.text;
    elements.feedbackList.appendChild(node);
  });
}

function saveResult() {
  if (!state.lastResult) {
    alert("검사 결과가 있어야 저장할 수 있어요.");
    return;
  }

  const record = {
    id: crypto.randomUUID(),
    studentName: elements.studentName.value || "이름 없음",
    studentNumber: elements.studentNumber.value || "-",
    targetText: elements.targetText.value,
    teacherNote: elements.teacherNote.value,
    score: state.lastResult.readabilityScore,
    recognizedText: state.lastResult.recognizedText,
    uncertainChars: state.lastResult.uncertainChars || [],
    createdAt: new Date().toLocaleString("ko-KR"),
  };

  state.history.unshift(record);
  localStorage.setItem("handwriting-history", JSON.stringify(state.history.slice(0, 80)));
  renderHistory();
  alert("학생 이력에 저장했어요.");
}

function renderHistory() {
  elements.historyList.innerHTML = "";

  if (!state.history.length) {
    elements.historyList.innerHTML = '<article class="history-card"><h3>아직 저장된 결과가 없어요.</h3><p>검사 결과를 저장하면 학생별 이력이 여기에 쌓입니다.</p></article>';
  } else {
    state.history.forEach((item) => {
      const card = document.createElement("article");
      card.className = "history-card";
      card.innerHTML = `
        <h3>${item.studentNumber}번 ${item.studentName}</h3>
        <p>${item.createdAt}</p>
        <p>가독성 ${item.score ?? "--"}점</p>
        <p>AI 판독: ${item.recognizedText || "-"}</p>
        <p>메모: ${item.teacherNote || "-"}</p>
      `;
      elements.historyList.appendChild(card);
    });
  }

  const scores = state.history.map((item) => Number(item.score)).filter(Number.isFinite);
  const common = state.history.flatMap((item) => item.uncertainChars || []);
  elements.statCount.textContent = state.history.length;
  elements.statAverage.textContent = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : "--";
  elements.statCommon.textContent = mostCommon(common) || "--";
}

function mostCommon(items) {
  const counts = items.reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function startCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    elements.cameraFeed.srcObject = state.stream;
    await elements.cameraFeed.play();
    elements.cameraFeed.classList.add("active");
    elements.takePhoto.classList.remove("hidden");
    elements.cameraStatus.textContent = "카메라 준비 완료";
  } catch {
    elements.cameraStatus.textContent = "카메라 권한 확인";
    alert("카메라를 열 수 없어요. 브라우저 권한을 확인해 주세요.");
  }
}

function takePhoto() {
  const video = elements.cameraFeed;
  const canvas = elements.cameraCanvas;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  setImage(canvas.toDataURL("image/jpeg", 0.92));
  state.stream?.getTracks().forEach((track) => track.stop());
  elements.cameraFeed.classList.remove("active");
  elements.takePhoto.classList.add("hidden");
  elements.cameraStatus.textContent = "사진 촬영 완료";
}

function switchView(view) {
  $$(".nav-pill").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((section) => section.classList.remove("active"));
  $(`#${view}-view`).classList.add("active");
  renderHistory();
}

elements.chooseImage.addEventListener("click", () => elements.imageInput.click());
elements.imageInput.addEventListener("change", (event) => readFile(event.target.files[0]));
elements.analyzeButton.addEventListener("click", analyzeHandwriting);
elements.saveResult.addEventListener("click", saveResult);
elements.exportResult.addEventListener("click", () => window.print());
elements.startCamera.addEventListener("click", startCamera);
elements.takePhoto.addEventListener("click", takePhoto);

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
});
elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
  readFile(event.dataTransfer.files[0]);
});

$$(".nav-pill").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
renderHistory();
