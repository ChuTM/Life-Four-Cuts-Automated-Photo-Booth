// Establish socket connection for real-time communication
const socket = io();
const deviceName = "iMac";
let sessionId = null; // Unique session identifier for file uploads
let filter = null; // Image filter configuration

// ——— Helpers ———

const refineImageLink = (l) => l.replace("./public", "");

function consoleLog(msg) {
	console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// Request fullscreen mode when document is clicked
document.addEventListener("click", () => {
	document.body.requestFullscreen().catch(() => {});
});

// DOM elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas"); // Capture canvas
const countdownDiv = document.getElementById("countdown");
const blurOverlay = document.getElementById("blur-overlay");
const clickSound = document.getElementById("click-sound");

// ——— Live Preview Variables ———
const previewCanvas = document.getElementById("live-preview-canvas");
const previewCtx = previewCanvas ? previewCanvas.getContext("2d") : null;
let currentFrameDef = null;
let bgImage = null;
let fgImage = null;
let isPreviewRunning = false;
let stream = null; // Media stream from camera

// INITIALIZATION: Ensure canvas is hidden and NOT flipped via CSS
if (previewCanvas) {
	previewCanvas.style.display = "none";
	// IMPORTANT: We remove the CSS flip here so the Frame Text is readable.
	// We will manually flip the video inside the render loop.
	previewCanvas.style.transform = "none";
}

// ——— Live Preview Logic ———

const loadAsset = (src) =>
	new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => {
			consoleLog(`Failed to load asset: ${src}`);
			resolve(null);
		};
		img.src = refineImageLink(src);
	});

/**
 * Resets the preview state (clears frame, hides canvas, stops loop)
 */
function resetPreview() {
	isPreviewRunning = false;
	currentFrameDef = null;
	bgImage = null;
	fgImage = null;
	if (previewCanvas) {
		previewCanvas.style.display = "none";
		previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
	}
	consoleLog("Preview reset");
}

/**
 * Fetches the frame JSON by ID and updates the preview
 */
async function loadFrameById(frameId) {
	try {
		consoleLog(`Fetching frame: ${frameId}`);
		const response = await fetch(`/frames/jsons/${frameId}.json`);
		if (!response.ok)
			throw new Error(`HTTP error! status: ${response.status}`);

		const frameData = await response.json();
		await updateLivePreviewFrame(frameData);
		consoleLog(`Frame loaded: ${frameData.title || frameId}`);
	} catch (e) {
		consoleLog(`Error loading frame ${frameId}: ${e.message}`);
		resetPreview();
	}
}

/**
 * Swaps the current frame definition and assets
 */
async function updateLivePreviewFrame(newFrameDef) {
	// 1. Pause rendering while loading
	const wasRunning = isPreviewRunning;
	isPreviewRunning = false;

	currentFrameDef = newFrameDef;

	// 2. Resize canvas to match the REAL resolution of the frame
	if (previewCanvas) {
		previewCanvas.width = currentFrameDef.Resolution.w;
		previewCanvas.height = currentFrameDef.Resolution.h;
	}

	// 3. Load Background and Foreground
	try {
		[bgImage, fgImage] = await Promise.all([
			loadAsset(currentFrameDef.background),
			loadAsset(currentFrameDef.foreground),
		]);

		// 4. Show canvas and resume rendering
		if (previewCanvas) previewCanvas.style.display = "block";
		isPreviewRunning = true;
		requestAnimationFrame(renderLoop);
	} catch (e) {
		consoleLog("Error loading frame assets: " + e.message);
		resetPreview();
	}
}

/**
 * Syncs the preview context filter with the video element's CSS filter
 */
function updatePreviewFilter() {
	if (!previewCtx) return;
	const currentFilter = video.style.filter;
	if (!currentFilter || currentFilter === "none") {
		previewCtx.filter = "none";
	} else {
		previewCtx.filter = currentFilter;
	}
}

/**
 * Calculates aspect ratio AND flips the video horizontally
 * inside the specific slot area.
 */
function drawVideoCover(vidSource, targetX, targetY, targetW, targetH) {
	if (!vidSource.videoWidth) return;

	// 1. Calculate Crop (Aspect Fit)
	const sourceRatio = vidSource.videoWidth / vidSource.videoHeight;
	const targetRatio = targetW / targetH;
	let sx, sy, sWidth, sHeight;

	if (sourceRatio > targetRatio) {
		sHeight = vidSource.videoHeight;
		sWidth = sHeight * targetRatio;
		sx = (vidSource.videoWidth - sWidth) / 2;
		sy = 0;
	} else {
		sWidth = vidSource.videoWidth;
		sHeight = sWidth / targetRatio;
		sx = 0;
		sy = (vidSource.videoHeight - sHeight) / 2;
	}

	// 2. Draw with Horizontal Flip (Center Pivot)
	previewCtx.save();

	// Move "pen" to center of the slot
	previewCtx.translate(targetX + targetW / 2, targetY + targetH / 2);

	// Flip horizontally
	previewCtx.scale(-1, 1);

	// Draw image centered at (0,0) relative to the translated point
	previewCtx.drawImage(
		vidSource,
		sx,
		sy,
		sWidth,
		sHeight,
		-targetW / 2,
		-targetH / 2,
		targetW,
		targetH
	);

	previewCtx.restore();
}

/**
 * Main Rendering Loop for the Preview Canvas
 */
function renderLoop() {
	if (!isPreviewRunning || !currentFrameDef || !previewCtx) return;

	if (video.readyState === video.HAVE_ENOUGH_DATA) {
		previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

		// 1. Draw Background (Normal - No Flip)
		previewCtx.save();
		previewCtx.filter = "none";
		if (bgImage) {
			previewCtx.drawImage(
				bgImage,
				0,
				0,
				previewCanvas.width,
				previewCanvas.height
			);
		}
		previewCtx.restore();

		// 2. Draw Video Slots (Flipped inside drawVideoCover + Filter)
		previewCtx.save();
		updatePreviewFilter(); // Apply active filters (sepia, bw, etc.)

		if (currentFrameDef.images && Array.isArray(currentFrameDef.images)) {
			currentFrameDef.images.forEach((slot) => {
				drawVideoCover(video, slot.x, slot.y, slot.w, slot.h);
			});
		}
		previewCtx.restore();

		// 3. Draw Foreground (Normal - No Flip)
		previewCtx.save();
		previewCtx.filter = "none";
		if (fgImage) {
			previewCtx.drawImage(
				fgImage,
				0,
				0,
				previewCanvas.width,
				previewCanvas.height
			);
		}
		previewCtx.restore();
	}

	requestAnimationFrame(renderLoop);
}

// ——— Camera Control ———

function startCamera() {
	if (stream) return;

	const constraints = {
		video: {
			facingMode: "user",
			width: { ideal: 1920, min: 1920 },
			height: { ideal: 1080, min: 1080 },
		},
	};

	navigator.mediaDevices
		.getUserMedia(constraints)
		.then((s) => handleStreamSuccess(s, "High-res"))
		.catch((e) => {
			consoleLog("High-res failed: " + e.message + " – trying fallback");
			navigator.mediaDevices
				.getUserMedia({ video: { facingMode: "user" } })
				.then((s) => handleStreamSuccess(s, "Fallback"))
				.catch((e2) =>
					consoleLog("Camera failed completely: " + e2.message)
				);
		});
}

function handleStreamSuccess(s, mode) {
	stream = s;
	video.srcObject = s;
	video.style.display = "block";
	video.style.filter = "blur(10px)";
	const settings = s.getVideoTracks()[0].getSettings();
	consoleLog(
		`Camera started (${mode}): ${settings.width}x${settings.height}`
	);

	// Resume preview loop if we already have a frame definition
	if (currentFrameDef) {
		isPreviewRunning = true;
		requestAnimationFrame(renderLoop);
	}
}

function unblur() {
	if (!stream) startCamera();
	video.style.filter = "none";
	resetPreview(); // :start -> Reset Preview
	socket.emit("chat message", { name: deviceName, msg: ":camera-ready" });
}

function blurVideo() {
	video.style.filter = "blur(10px)";
	resetPreview(); // :end -> Reset Preview
}

function stopCamera() {
	if (stream) {
		stream.getTracks().forEach((t) => t.stop());
		stream = null;
	}
	video.srcObject = null;
	video.style.display = "none";
	resetPreview(); // :stop -> Reset Preview
}

// ——— Countdown & Capture ———

function startCountdown(seconds) {
	blurOverlay.style.display = "block";
	countdownDiv.style.display = "block";
	let count = seconds;
	countdownDiv.textContent = count;

	const interval = setInterval(() => {
		count--;
		if (count > 0) {
			countdownDiv.textContent = count;
		} else {
			clearInterval(interval);
			captureImage();
			blurOverlay.style.display = "none";
			countdownDiv.style.display = "none";
		}
	}, 1000);
}

async function captureImage() {
	if (!stream || !video.videoWidth) return consoleLog("Capture failed");

	video.pause();
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	const ctx = canvas.getContext("2d");

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.scale(-1, 1);
	ctx.translate(-canvas.width, 0);

	// Apply filters for capture
	if (filter && typeof filter === "object") {
		let filterStr = "";
		const validFilters = {
			sepia: (v) => `sepia(${v})`,
			grayscale: (v) => `grayscale(${v})`,
			brightness: (v) => `brightness(${v})`,
			contrast: (v) => `contrast(${v})`,
			saturate: (v) => `saturate(${v})`,
			invert: (v) => `invert(${v})`,
			opacity: (v) => `opacity(${v})`,
			"hue-rotate": (v) => `hue-rotate(${v})`,
		};
		Object.keys(filter).forEach((key) => {
			const val = filter[key];
			if (val !== undefined && validFilters[key]) {
				filterStr += validFilters[key](val) + " ";
			}
		});
		if (filterStr) ctx.filter = filterStr.trim();
	}

	ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
	ctx.filter = "none";
	video.play();

	clickSound.currentTime = 0;
	clickSound.play().catch(() => {});

	if (!sessionId) {
		consoleLog("No sessionId – cannot upload");
		socket.emit("chat message", { name: deviceName, msg: ":camera-ready" });
		return;
	}

	const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
	const form = new FormData();
	form.append("image", blob, `${sessionId}-${Date.now()}.png`);
	form.append("sessionId", sessionId);

	try {
		const res = await fetch("/upload-image", {
			method: "POST",
			body: form,
		});
		const data = await res.json();
		if (data.success && data.link) {
			document.body.style.setProperty(
				"--captured-image",
				`url(${data.link})`
			);
			document
				.querySelector(".animation-captured")
				.classList.add("animates");
			socket.emit("chat message", {
				name: deviceName,
				msg: `:animation-started-${data.link}`,
			});
			setTimeout(() => {
				document
					.querySelector(".animation-captured")
					.classList.remove("animates");
			}, 1500);
		}
		consoleLog("Upload response: " + JSON.stringify(data));
	} catch (e) {
		consoleLog("Upload error: " + e.message);
	}

	setTimeout(() => {
		socket.emit("chat message", { name: deviceName, msg: ":camera-ready" });
	}, 1000);
}

// ——— Socket Communication ———

socket.on("connect", () => {
	socket.emit("join", {
		name: deviceName,
		folder: "/" + deviceName.toLowerCase(),
	});
	consoleLog("Connected");
});

socket.on("session-id", (sid) => {
	sessionId = sid;
	consoleLog("Session ID: " + sid);
});

socket.on("command", (cmd) => {
	consoleLog(`Command: ${cmd}`);
	const m = cmd.match(/^(.*?)\s*->\s*(.*?)$/);
	if (m) {
		const command = m[1].trim(),
			target = m[2].trim();
		if (target === deviceName || target === "all") {
			try {
				const r = eval(command);
				socket.emit("command response", {
					to: "Admin",
					from: deviceName,
					response: `${r}`,
				});
			} catch (e) {
				socket.emit("command response", {
					to: "Admin",
					from: deviceName,
					response: `Error: ${e.message}`,
				});
			}
		}
	} else {
		try {
			eval(cmd);
		} catch {}
	}
});

socket.on("chat message", (data) => {
	consoleLog(`Chat from ${data.name}: ${data.msg}`);
	const msg = data.msg.trim();

	if (msg === ":ready") startCamera();
	else if (msg === ":start") unblur(); // Handles resetPreview inside
	else if (msg === ":end") blurVideo(); // Handles resetPreview inside
	else if (msg === ":stop") stopCamera(); // Handles resetPreview inside
	else if (msg === ":capture") captureImage();
	else if (msg === ":toggle-collapse") {
		const preview = document.getElementById("live-preview-canvas")
		if (preview.classList.contains("collapsed")) preview.classList.remove("collapsed");
		else preview.classList.add("collapsed");
	}
	// Frame Selection Handler
	else if (msg.startsWith(":frame-")) {
		const frameId = msg.match(/^:frame-(.+)-[^-]+$/)?.[1] ?? null;
		if (frameId) {
			loadFrameById(frameId);
		} else {
			consoleLog("Invalid frame message format");
		}
	} else if (msg.startsWith(":countdown-") && msg.endsWith("-capture")) {
		const seconds = parseInt(msg.split("-")[1]);
		if (!isNaN(seconds) && seconds > 0) startCountdown(seconds);
	} else if (msg.startsWith(":filter-")) {
		const filterJson = msg.replace(":filter-", "");
		filter = JSON.parse(filterJson);
		let filterStr = "";
		Object.keys(filter).forEach((k) => {
			if (filter[k] !== undefined) filterStr += `${k}(${filter[k]}) `;
		});
		video.style.filter = filterStr;
	}
});

// Start camera on initial load
startCamera();
