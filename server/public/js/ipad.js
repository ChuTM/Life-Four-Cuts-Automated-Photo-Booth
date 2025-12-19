// Prevent default gesture behaviors that might interfere with UI
document.addEventListener("gesturestart", function (e) {
	e.preventDefault();
});
document.addEventListener("doubleclick", function (e) {
	e.preventDefault();
});

// Prevent default click behavior for non-interactive elements
var allElements = document.getElementsByTagName("*");
for (let i = 0; i < allElements.length; i++) {
	allElements[i].addEventListener("click", function (e) {
		// Allow clicks on inputs and links
		if (e.target.tagName == "INPUT" || e.target.tagName == "A") return;
		e.preventDefault();
	});
}

// DOM query helper (returns single element or collection)
const $ = (s) =>
	document.querySelectorAll(s).length > 1
		? document.querySelectorAll(s)
		: document.querySelector(s);

// Socket connection and device configuration
const socket = io();
const deviceName = "iPad";
let sessionId = null;

const teachers = $(".teacher");
const btnLeft = $(".round-button.l");
const btnRight = $(".round-button.r");

let currentIndex = 0;

// Find initial current teacher
teachers.forEach((el, i) => {
	if (el.classList.contains("current")) currentIndex = i;
});

let introing = false;
let introed = false;
let toStart = false;
function tryStart() {
	if (!toStart) return;

	$(".page-1").classList.add("hide");
	$(".page-1").style.transform = "translateY(100%)";

	console.log("object");

	setTimeout(() => {
		$(".page-2").classList.remove("hide");
		if (navigator === "lly") {
			vn.trigger(navigator, 2);
			sendVNCommand(`vn.trigger(navigator, 2);`);
		}
	}, 400);
}

const update = () => {
	introing = true;
	introed = true;
	teachers.forEach((el, i) => {
		el.classList.remove("current", "up", "down");
		if (i === currentIndex) {
			el.classList.add("current");
			navigator = el.getAttribute("data-navigator");
			sendVNCommand(`navigator = "${navigator}";`);
			vn.trigger(navigator, 1).then(() => {
				introing = false;
				tryStart();
			});
			sendVNCommand(`vn.trigger(navigator, 1);`);
		} else if (i < currentIndex) el.classList.add("up");
		else el.classList.add("down");
	});
};

btnLeft.addEventListener("click", () => {
	currentIndex = currentIndex > 0 ? currentIndex - 1 : teachers.length - 1;
	update();
});

btnRight.addEventListener("click", () => {
	currentIndex = currentIndex < teachers.length - 1 ? currentIndex + 1 : 0;
	update();
});

// Handle start button click - navigate to frame selection
$(".start-button").addEventListener("click", () => {
	socket.emit("chat message", { name: deviceName, msg: ":start" });
	toStart = true;

	$(".start-button").disabled = "true";

	$(".page-1").classList.add("animating");

	socket.emit("chat message", {
		name: deviceName,
		msg: `:navigator-${navigator}`,
	});

	socket.emit("chat message", {
		name: deviceName,
		msg: `:starts-${Date.now()}`,
	});

	console.log(navigator, "test point");

	if (!introing) {
		if (introed) {
			tryStart();
		} else {
			vn.trigger(navigator, 1).then(() => {
				console.log(navigator, "test point 2");
				tryStart();
			});
			sendVNCommand(`vn.trigger(navigator, 1);`);
		}
	}
});

$(".leave-button").forEach((e) => {
	e.addEventListener("click", () => {
		location.reload();
	});
});

// Frame selection handlers
$(".frame").forEach((e) => {
	e.addEventListener("click", () => {
		// Toggle selection state
		if (e.getAttribute("data-disabled") != null) return;
		if (e.classList.contains("selected")) {
			$(".frame-button").classList.remove("continue");
			return e.classList.remove("selected");
		}

		// Set as selected and enable continue button
		$(".frame-button").classList.add("continue");
		$(".frame").forEach((f) => f.classList.remove("selected"));
		e.classList.add("selected");
	});
});

let selectedFrame,
	framePictureAmount = 4; // Selected frame properties

let frameDetail = {};

async function loadFrame(n) {
	return new Promise((r) => {
		fetch(`/frames/jsons/${n}.json`)
			.then((response) => response.json())
			.then((data) => {
				frameDetail = data;
				r(data);
				console.log("Frame details loaded:", frameDetail);
			})
			.catch((error) => {
				console.error("Error loading frame details:", error);
			});
	});
}

// Handle frame confirmation - navigate to filter selection
$(".frame-button").addEventListener("click", () => {
	if (!$(".frame-button").classList.contains("continue")) return;

	// Get selected frame details
	selectedFrame = $(".selected").id;
	framePictureAmount = $(".selected").getAttribute("data-pictures-required");

	// Notify system of frame selection
	socket.emit("chat message", {
		name: deviceName,
		msg: `:frame-${selectedFrame}-${framePictureAmount}`,
	});

	loadFrame(selectedFrame);

	// Page-2 -> Page-3

	$(".page-3").classList.remove("hide");
	$(".page-2").classList.add("hide");

	vn.trigger("lly", 3);
	sendVNCommand(`vn.trigger("lly", 3);`);
	vn.trigger("cml", 2);
	sendVNCommand(`vn.trigger("cml", 2);`);
	vn.trigger("csl", 2);
	sendVNCommand(`vn.trigger("csl", 2);`);
	vn.trigger("hht", 2);
	sendVNCommand(`vn.trigger("hht", 2);`);
});

const swiper = $("#filterSwiper");
const track = $(".carousel-track");
const filters = $(".carousel-track .filter");
const filterCount = filters.length;
let currentFilterIndex = 0; // Track active filter index

let isDragging = false;
let startX = 0;
let currentTranslateX = 0;
let dragDistance = 0;
let vwUnit = window.innerWidth / 100; // Value of 1vw in pixels

// --- Variables for Velocity Tracking ---
let lastDragX = 0;
let lastDragTime = 0;
let dragVelocity = 0; // Calculated in px/ms
const VELOCITY_THRESHOLD = 0.3; // px/ms threshold for a fast swipe

/**
 * Calculates the target X translation (in pixels) to center a filter.
 */
function calculateTargetTranslation(index) {
	vwUnit = window.innerWidth / 100;
	const slideUnitPx = 100 * vwUnit;
	return -(index * slideUnitPx);
}

function snapToFilterIndex(index) {
	currentFilterIndex = Math.min(Math.max(index, 0), filterCount - 1);
	const targetX = calculateTargetTranslation(currentFilterIndex);
	track.style.transform = `translateX(${targetX}px)`;
	currentTranslateX = targetX;
	syncFilter();
}

function startDrag(e) {
	isDragging = true;
	startX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
	track.style.transition = "none";
	const transformMatch = track.style.transform.match(/translateX\((.*?)px\)/);
	currentTranslateX = transformMatch ? parseFloat(transformMatch[1]) : 0;
	lastDragX = startX;
	lastDragTime = Date.now();
	dragVelocity = 0;
	swiper.style.cursor = "grabbing";
	e.preventDefault();
}

function drag(e) {
	if (!isDragging) return;
	const currentX = e.type.includes("mouse")
		? e.clientX
		: e.touches[0].clientX;
	dragDistance = currentX - startX;
	const currentTime = Date.now();
	const timeDiff = currentTime - lastDragTime;
	if (timeDiff > 0) {
		const deltaX = currentX - lastDragX;
		dragVelocity = deltaX / timeDiff;
	}
	lastDragX = currentX;
	lastDragTime = currentTime;
	const newX = currentTranslateX + dragDistance;
	track.style.transform = `translateX(${newX}px)`;
}

function endDrag() {
	if (!isDragging) return;
	isDragging = false;
	track.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
	swiper.style.cursor = "grab";

	const slideUnitPx = 100 * vwUnit;
	const distanceThreshold = slideUnitPx * 0.2;
	let targetIndex = currentFilterIndex;

	if (dragVelocity < -VELOCITY_THRESHOLD) {
		targetIndex = currentFilterIndex + 1;
	} else if (dragVelocity > VELOCITY_THRESHOLD) {
		targetIndex = currentFilterIndex - 1;
	} else if (dragDistance < -distanceThreshold) {
		targetIndex = currentFilterIndex + 1;
	} else if (dragDistance > distanceThreshold) {
		targetIndex = currentFilterIndex - 1;
	}

	targetIndex = Math.min(Math.max(targetIndex, 0), filterCount - 1);
	snapToFilterIndex(targetIndex);

	startX = 0;
	dragDistance = 0;
	dragVelocity = 0;
}

function handleResize() {
	vwUnit = window.innerWidth / 100;
	snapToFilterIndex(currentFilterIndex);
}

function initSwipe() {
	swiper.addEventListener("touchstart", startDrag);
	swiper.addEventListener("touchmove", drag);
	swiper.addEventListener("touchend", endDrag);
	swiper.addEventListener("touchcancel", endDrag);

	swiper.addEventListener("mousedown", startDrag);
	swiper.addEventListener("mousemove", drag);
	swiper.addEventListener("mouseup", endDrag);
	swiper.addEventListener("mouseleave", endDrag);

	window.addEventListener("resize", handleResize);
	snapToFilterIndex(currentFilterIndex);
}

function syncFilter() {
	const selectedFilter = filters[currentFilterIndex];
	const overlay = selectedFilter.querySelector(".filter-overlay");
	const filterStyle = getComputedStyle(overlay).backdropFilter;

	let filterDetails = {};

	if (filterStyle && filterStyle !== "none") {
		const regex = /([\w-]+)\(([^)]+)\)/g;
		let match;
		while ((match = regex.exec(filterStyle)) !== null) {
			const name = match[1];
			const value = match[2];
			filterDetails[name] = value.trim();
		}
	}

	socket.emit("chat message", {
		name: deviceName,
		msg: `:filter-${JSON.stringify(filterDetails)}`,
	});
}

// Handle filter confirmation - navigate to capture phase
$(".filter-button").addEventListener("click", () => {
	console.log(`Filter ${currentFilterIndex + 1} selected!`);

	$(".page-4").classList.remove("hide");
	$(".page-3").classList.add("hide");

	vn.trigger("lly", 4);
	sendVNCommand(`vn.trigger("lly", 4);`);
	vn.trigger("cml", 3);
	sendVNCommand(`vn.trigger("cml", 3);`);
	vn.trigger("csl", 3);
	sendVNCommand(`vn.trigger("csl", 3);`);
	vn.trigger("hht", 3);
	sendVNCommand(`vn.trigger("hht", 3);`);

	setTimeout(() => startFilmingProcess(), navigator === "csl" ? 10000 : 5000);
});

window.onload = initSwipe;

$(".text-offer .skip").addEventListener("click", () => {
	$(".o1").style.display = "none";
	$(".o3").style.display = "flex";
});

$("#purchase-confirm").addEventListener("input", (e) => {
	cancelPulse();
	$(".purchase-confirm-overlap").style.background = `rgba(255, 255, 255, ${
		0.5 + e.target.value / 200
	})`;
	$("#purchase-confirm").style.setProperty("--value", `${e.target.value}%`);
});

let cancelPulse = () => {};

$(".shop").addEventListener("click", () => {
	$(".purchase-confirm-overlap").classList.add("visible");
	function setAnimationValue(v) {
		$("#purchase-confirm").value = v;
	}

	const durationMs = 1000;
	const startNum = 0;
	const maxNum = 7;
	const easing = (t) => 1 - Math.pow(1 - t, 4);
	const step = 0.001;
	const repeatCount = 2;
	const startDelay = 400;

	setTimeout(() => {
		const half = durationMs / 2;
		const up = [];
		const down = [];
		for (let i = startNum; i <= maxNum; i += step) up.push(i);
		for (let i = maxNum; i >= startNum; i -= step) down.push(i);

		let done = 0;

		const play = () => {
			if (done >= repeatCount) return;

			let upIdx = 0,
				downIdx = 0;
			let cancelled = false;
			const start = performance.now();

			cancelPulse = () => {
				cancelled = true;
				setAnimationValue(startNum);
				cancelPulse = () => {};
			};

			const tick = (now) => {
				if (cancelled) return;

				const elapsed = now - start;

				if (elapsed < half) {
					const p = elapsed / half;
					const target = Math.floor(easing(p) * up.length);
					while (upIdx < target) setAnimationValue(up[upIdx++]);
				} else {
					const p = (elapsed - half) / half;
					if (p >= 1 || cancelled) {
						while (downIdx < down.length)
							setAnimationValue(down[downIdx++]);
						done++;
						if (done < repeatCount && !cancelled) {
							requestAnimationFrame(play);
						}
						return;
					}
					const target = Math.floor(easing(p) * down.length);
					while (downIdx < target) setAnimationValue(down[downIdx++]);
				}

				requestAnimationFrame(tick);
			};

			requestAnimationFrame(tick);
		};

		play();
	}, startDelay);
});

$(".purchase-confirm-overlap button").addEventListener("click", () => {
	$(".purchase-confirm-overlap").classList.remove("visible");
});

const COUNTDOWN_SECONDS = 20;

function startFilmingProcess() {
	const fractionElement = document.querySelector(".page-4 .fraction");
	const countdownElement = document.querySelector(".page-4 .countdown");

	$("button.skip").style.display = "block";

	let index = 0;

	function countdownStarts() {
		let countdown = COUNTDOWN_SECONDS;

		$("button.skip").classList.add("show");
		$("button.toggle-preview-collapse").classList.add("show");

		$("button.skip").onclick = () => {
			if (countdown > 6) countdown = 6;
		};

		$("button.toggle-preview-collapse").onclick = () => {
			$(
				"button.toggle-preview-collapse>.animated-arrows"
			).classList.toggle("collapsed");
			socket.emit("chat message", {
				name: deviceName,
				msg: `:toggle-collapse`,
			});
		};

		let current = index + 1;

		if (current == 2) {
			vn.trigger("lly", 6);
			sendVNCommand(`vn.trigger("lly", 6);`);
		} else if (current == 4) {
			vn.trigger("lly", 8);
			sendVNCommand(`vn.trigger("lly", 8);`);
		} else if (current == 6) {
			vn.trigger("lly", 11);
			sendVNCommand(`vn.trigger("lly", 11);`);
		}

		fractionElement.textContent = `${current} / 6`;
		countdownElement.textContent = countdown;
		$(".unit").textContent = "seconds";

		const interval = setInterval(() => {
			countdown--;
			countdownElement.textContent = countdown === 0 ? "" : countdown;
			if (countdown === 1) $(".unit").textContent = "second";

			if (countdown === 5) {
				socket.emit("chat message", {
					name: deviceName,
					msg: `:countdown-${countdown}-capture`,
				});

				if (current == 1) {
					vn.trigger("lly", 5);
					sendVNCommand(`vn.trigger("lly", 5);`);
				} else if (current == 3) {
					vn.trigger("lly", 7);
					sendVNCommand(`vn.trigger("lly", 7);`);
				} else if (current == 4) {
					vn.trigger("lly", 9);
					sendVNCommand(`vn.trigger("lly", 9);`);
				} else if (current == 5) {
					vn.trigger("lly", 10);
					sendVNCommand(`vn.trigger("lly", 10);`);
				} else if (current == 6) {
					vn.trigger("lly", 12);
					sendVNCommand(`vn.trigger("lly", 12);`);
				}
			}

			if (countdown <= 0) {
				clearInterval(interval);
				index++;

				setTimeout(() => {
					if (index < 6) {
						countdownStarts();
					} else {
						socket.emit("chat message", {
							name: deviceName,
							msg: `:end`,
						});
						$(".page-5").classList.remove("hide");
						initPage5();
						$(".page-4").classList.add("hide");
					}
				}, 5000);
			}
		}, 1000);
	}

	countdownStarts();
}

function consoleLog(msg) {
	console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

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

let previewPhotos = [];

const refineImageLink = (l) => l.replace("./public", "");

async function renderPreviewToCanvas(frameDef, imageMap) {
	const canvas = document.querySelector(".page-5 .preview canvas");
	if (!canvas) return;

	const PREVIEW_W = 480;
	const PREVIEW_H = 715;
	const REAL_W = frameDef.Resolution.w;
	const REAL_H = frameDef.Resolution.h;

	const ctx = canvas.getContext("2d");

	const offscreen = new OffscreenCanvas(REAL_W, REAL_H);
	const offCtx = offscreen.getContext("2d");

	const load = (src) =>
		new Promise((res, rej) => {
			const img = new Image();
			img.onload = () => res(img);
			img.onerror = rej;
			img.crossOrigin = "anonymous";
			img.src = src;
		});

	const drawCover = (img, x, y, w, h) => {
		const scale = Math.max(w / img.width, h / img.height);
		const sw = w / scale;
		const sh = h / scale;
		const sx = (img.width - sw) / 2;
		const sy = (img.height - sh) / 2;
		offCtx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
	};

	const bg = await load(refineImageLink(frameDef.background));
	offCtx.drawImage(bg, 0, 0, REAL_W, REAL_H);

	for (const item of frameDef.images) {
		const src = imageMap[item.src];
		if (!src) {
			offCtx.fillStyle = "#cccccc";
			offCtx.fillRect(item.x, item.y, item.w, item.h);
			continue;
		}
		try {
			const photo = await load(src);
			drawCover(photo, item.x, item.y, item.w, item.h);
		} catch (e) {
			offCtx.fillStyle = "#cccccc";
			offCtx.fillRect(item.x, item.y, item.w, item.h);
		}
	}

	const fg = await load(refineImageLink(frameDef.foreground));
	offCtx.drawImage(fg, 0, 0, REAL_W, REAL_H);

	canvas.width = PREVIEW_W;
	canvas.height = PREVIEW_H;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(offscreen, 0, 0, REAL_W, REAL_H, 0, 0, PREVIEW_W, PREVIEW_H);
}

let selectedImages = new Array(framePictureAmount).fill(null);
let selectedImageMap = {};

function initPage5() {
	vn.trigger("lly", 13);
	sendVNCommand(`vn.trigger("lly", 13);`);
	renderPreviewToCanvas(frameDetail, {});

	let index = 0;
	$(".page-5>.grid>.img").forEach((e) => {
		e.querySelector("img").src = previewPhotos[index];
		index++;
		e.addEventListener("click", () => {
			const actualSrc = e.querySelector("img").src;
			const alreadyIndex = selectedImages.indexOf(actualSrc);

			if (alreadyIndex !== -1) {
				selectedImages[alreadyIndex] = null;
				e.classList.remove("selected");
				const placeholderKey = Object.keys(selectedImageMap).find(
					(k) => selectedImageMap[k] === actualSrc
				);
				if (placeholderKey) selectedImageMap[placeholderKey] = null;
			} else {
				const emptySlotIndex = selectedImages.indexOf(null);
				e.classList.add("selected");
				if (emptySlotIndex !== -1) {
					selectedImages[emptySlotIndex] = actualSrc;
					const placeholderKey = `{{image-${emptySlotIndex + 1}}}`;
					selectedImageMap[placeholderKey] = actualSrc;
				}
			}
			renderPreviewToCanvas(frameDetail, selectedImageMap);
		});
	});

	$(".confirm-result-button").addEventListener("click", () => {
		socket.emit("chat message", {
			name: deviceName,
			msg: `:generate-${JSON.stringify(selectedImages)}`,
		});
		vn.trigger("lly", 14);
		sendVNCommand(`vn.trigger("lly", 14);`);
	});
}

socket.on("chat message", (data) => {
	consoleLog(`Chat from ${data.name}: ${data.msg}`);
	const msg = data.msg.trim();

	if (msg.startsWith(":animation-started-")) {
		const url = msg.replace(":animation-started-", "");
		const previewLink = url.replace(".png", "-preview.webp");
		previewPhotos.push(url);
		document.body.style.setProperty(
			"--captured-image",
			`url(${previewLink})`
		);

		setTimeout(() => {
			document
				.querySelector(".animation-captured")
				.classList.add("animates");
			setTimeout(() => {
				document
					.querySelector(".animation-captured")
					.classList.remove("animates");
			}, 3000);
		}, 1000);
	}

	if (msg === ":camera-ready") {
		cameraReady = true;
		consoleLog("Camera is ready for next capture.");
	}

	if (msg.startsWith(":local-link-")) {
		const link = msg.replace(":local-link-", "");

		$(".page-5").classList.add("hide");
		$(".page-6").classList.remove("hide");

		vn.trigger("cml", 4);
		sendVNCommand(`vn.trigger("cml", 4);`);
		vn.trigger("hht", 4);
		sendVNCommand(`vn.trigger("hht", 4);`);

		try {
			vn.trigger("csl", 4);
			sendVNCommand(`vn.trigger("csl", 4);`);
			vn.trigger("csl", 4).then(() => {
				vn.trigger("csl", 5);
				sendVNCommand(`vn.trigger("csl", 5);`);
			});
			sendVNCommand(`vn.trigger("csl", 4).then(() => {
				vn.trigger("csl", 5);
			});`);
		} catch {}

		$(".page-6 img").src = link;
		$(".page-7 .final-image").src = link;

		let blur = 20;
		const interval = setInterval(() => {
			$(".page-6 img").style.filter = `blur(${blur}px)`;
			blur = Math.max(0, blur - 2);
			if (blur === 0) {
				$(".page-6 img").style.filter = `blur(0px)`;
				clearInterval(interval);
			}
		}, 500);
	}

	if (msg.startsWith(":google-drive-link-")) {
		const link = msg.replace(":google-drive-link-", "");

		socket.emit("chat message", {
			name: deviceName,
			msg: `:print-${link}`,
		});

		$("#purchase-confirm").addEventListener("change", (e) => {
			if (e.target.value != 100) {
				e.target.value = 0;
				$("#purchase-confirm").style.setProperty("--value", "0%");
				$(
					".purchase-confirm-overlap"
				).style.background = `rgba(255, 255, 255, 0.5)`;
				return;
			}
			$(".purchase-confirm-overlap").classList.remove("visible");
			$(".o1").style.display = "none";
			$(".o2").style.display = "flex";
			socket.emit("chat message", {
				name: deviceName,
				msg: `:purchase-confirmed-${link}`,
			});
		});

		$(".page-6").classList.add("hide");
		$(".page-7").classList.remove("hide");

		let countdown = 120;
		setInterval(() => {
			$(".page-7 .countdown").textContent = `${countdown}s`;
			countdown--;
			if (countdown === 0) location.reload();
		}, 1000);

		new QRCode($(".qr-code"), {
			text: `https://sccl4c.web.app/?l=${encodeURIComponent(link)}`,
			width: 200,
			height: 200,
			colorDark: "#000000",
			colorLight: "#ffffff",
		});
	}
});

function sendVNCommand(cmd) {
	socket.emit("chat message", {
		name: deviceName,
		msg: `:vn-command-${cmd}`,
	});
}

sendVNCommand(`navigator = "lly";`);
