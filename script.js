let port, reader;
let dataHistory = Array(20).fill(0);
let lastAlertTime = 0;

// Register Service Worker for Notifications
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// Initialize Chart
const trendCtx = document.getElementById('trendChart').getContext('2d');
const trendChart = new Chart(trendCtx, {
    type: 'line',
    data: {
        labels: Array(20).fill(''),
        datasets: [{
            data: dataHistory,
            borderColor: '#00f2ff',
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(0, 242, 255, 0.05)',
            pointRadius: 0
        }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { display: false }, x: { display: false } } }
});

async function connect() {
    // Request notification permission on initialization
    if ("Notification" in window) {
        Notification.requestPermission();
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        document.getElementById("status").innerText = "CORE: ONLINE";
        document.getElementById("status").style.color = "#00f2ff";
        readLoop();
    } catch (e) { console.log("Serial Cancelled"); }
}

async function readLoop() {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        handleMessage(value);
    }
}

function sendPhoneNotification(type, reasoning) {
    if (Notification.permission === "granted") {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(`GUARDIAN: ${type} ALERT`, {
                body: reasoning,
                icon: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                vibrate: [200, 100, 200]
            });
        });
    }
}

function handleMessage(msg) {
    msg = msg.toLowerCase();
    let threatFound = false;
    let type = "";
    let reasoning = "";

    if (msg.includes("fire")) { updateUI("fire", "CRITICAL", 100); type = "FIRE"; reasoning = "Critical thermal runaway detected."; threatFound = true; }
    if (msg.includes("smoke")) { updateUI("smoke", "DANGER", 85); type = "SMOKE"; reasoning = "Particulate density spike detected."; threatFound = true; }
    if (msg.includes("object")) { updateUI("motion", "MOVEMENT", 70); type = "MOTION"; reasoning = "Proximity alarm triggered."; threatFound = true; }
    if (msg.includes("rain")) { updateUI("water", "DETECTED", 90); type = "RAIN"; reasoning = "Environmental moisture detected."; threatFound = true; }
    if (msg.includes("intruder")) { updateUI("laser", "BREACH", 100); type = "INTRUDER"; reasoning = "Perimeter breach detected! Laser beam interrupted."; threatFound = true; }

    if (threatFound) {
        document.getElementById("ai-thought").innerText = reasoning;
        speakAI(reasoning);
        if (Date.now() - lastAlertTime > 5000) {
            sendPhoneNotification(type, reasoning); // Notification Trigger
            saveAutomaticRecord(type);
            lastAlertTime = Date.now();
        }
    }

    dataHistory.push(threatFound ? 100 : 0);
    dataHistory.shift();
    trendChart.update();
}

function updateUI(id, status, conf) {
    const card = document.getElementById(id);
    card.classList.add("alarm");
    document.getElementById(`val-${id}`).innerText = status;
    document.getElementById(`conf-${id}`).style.width = conf + "%";
    setTimeout(() => {
        card.classList.remove("alarm");
        document.getElementById(`val-${id}`).innerText = (id === "laser") ? "SECURE" : (id === "water") ? "DRY" : "STABLE";
        document.getElementById(`conf-${id}`).style.width = "0%";
    }, 6000);
}

function handleChatKey(e) { if (e.key === "Enter") sendChat(); }

function sendChat() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;
    addChatMsg(text, "user-msg");
    input.value = "";
    setTimeout(() => {
        let response = "";
        const lowText = text.toLowerCase();
        if (lowText.includes("summary") || lowText.includes("report")) response = getDailySummary();
        else if (lowText.includes("status")) response = `System status is nominal. Security perimeter is ${document.getElementById("val-laser").innerText}.`;
        else response = "I am monitoring all neural nodes. Ask for a 'summary' for logs.";
        addChatMsg(response, "ai-msg");
        speakAI(response);
    }, 600);
}

function getDailySummary() {
    const archives = JSON.parse(localStorage.getItem("guardian_records") || "[]");
    const today = new Date().toLocaleDateString();
    const todaysEvents = archives.filter(rec => rec.date === today);
    if (todaysEvents.length === 0) return "No threats have been detected today.";
    return `Today's Summary: recorded ${todaysEvents.length} events.`;
}

function addChatMsg(text, className) {
    const body = document.getElementById("chat-body");
    const msg = document.createElement("div");
    msg.className = className;
    msg.innerText = text;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
}

function saveAutomaticRecord(type) {
    const record = { id: Date.now(), type: type, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), details: `Neural alert triggered by ${type} sensor.` };
    let archives = JSON.parse(localStorage.getItem("guardian_records") || "[]");
    archives.push(record);
    localStorage.setItem("guardian_records", JSON.stringify(archives));
    renderArchives();
}

function renderArchives(filter = "") {
    const grid = document.getElementById("archive-grid");
    if(!grid) return;
    grid.innerHTML = "";
    let archives = JSON.parse(localStorage.getItem("guardian_records") || "[]");
    archives.reverse().forEach(rec => {
        const searchStr = (rec.type + rec.date).toLowerCase();
        if (filter && !searchStr.includes(filter.toLowerCase())) return;
        const el = document.createElement("div");
        el.className = "record-card";
        el.innerHTML = `<div class="record-tag">${rec.type} ALERT</div><div class="record-time">${rec.date} | ${rec.time}</div><div class="record-data">${rec.details}</div>`;
        grid.appendChild(el);
    });
}

function filterArchives() { renderArchives(document.getElementById("searchInput").value); }

function stopAlarm() {
    window.speechSynthesis.cancel();
    ["fire", "smoke", "motion", "water", "laser"].forEach(id => {
        const card = document.getElementById(id);
        if(card) card.classList.remove("alarm");
    });
}

function speakAI(text) {
    const speech = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(speech);
}

window.onload = renderArchives;