const io = require("socket.io-client");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");
const readline = require("readline");
const sharp = require("sharp"); // Handles the resizing/borders

// ==================== ⚙️ CONFIGURATION ====================

const DEFAULT_URL = "http://192.168.129.63:7721";
const DEV_MODE = false;
const deviceName = "PrinterPC";

const tempDir = path.join(os.tmpdir(), "printerpc-mac");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

// ==================== PRINTER DETECTION ====================
function getL4260PrinterName(callback) {
	if (DEV_MODE) return callback("Mock_Epson_L4260_Series");

	exec("lpstat -e", (err, stdout) => {
		if (err || !stdout) return callback(null);
		const printers = stdout
			.split("\n")
			.map((p) => p.trim())
			.filter(Boolean);

		const match = printers.find(
			(p) =>
				p.toLowerCase().includes("l4260") ||
				p.toLowerCase().includes("4260")
		);
		callback(match || null);
	});
}

// ==================== MAIN LOGIC ====================
async function downloadAndPrint(imageID, printMode) {
	const cleanUrl = `https://lh3.googleusercontent.com/d/${imageID}`;
	const filename = `raw_${imageID}_${Date.now()}.jpg`;
	const processedFilename = `processed_4R_${imageID}_${Date.now()}.jpg`;

	const filepath = path.join(tempDir, filename);
	const processedPath = path.join(tempDir, processedFilename);

	try {
		console.log(`----------------------------------------`);
		console.log(`⬇️  Downloading image ID: ${imageID}`);

		const response = await axios({
			url: cleanUrl,
			method: "GET",
			responseType: "stream",
			headers: { "User-Agent": "Mozilla/5.0" },
		});

		const writer = fs.createWriteStream(filepath);
		response.data.pipe(writer);

		await new Promise((resolve, reject) => {
			writer.on("finish", resolve);
			writer.on("error", reject);
		});

		let fileToPrint = filepath;

		// --- IMAGE PROCESSING ---
		const DPI = 300;
		const mmToPixel = (mm) => Math.round((mm / 25.4) * DPI);

		const canvasWidth = 1200; // 4 inches
		const canvasHeight = 1800; // 6 inches

		if (printMode === "RECEIPT") {
			console.log(`🧾 Processing LEFT HALF and FILLING rectangle...`);

			const receiptWidth = mmToPixel(22);
			const receiptHeight = mmToPixel(53);
			const borderWidth = 1;

			// 1. Get metadata to calculate the half-cut
			const pipeline = sharp(filepath);
			const metadata = await pipeline.metadata();

			// 2. Crop the left half, then RESIZE to FILL (cover)
			const receiptBuffer = await pipeline
				.extract({
					left: 0,
					top: 0,
					width: Math.floor(metadata.width / 2),
					height: metadata.height - 75,
				})
				.resize(receiptWidth, receiptHeight, {
					fit: "cover", // This fills the dimensions completely
					position: "center",
				})
				.flatten({ background: { r: 255, g: 255, b: 255 } })
				.extend({
					top: borderWidth,
					bottom: borderWidth,
					left: borderWidth,
					right: borderWidth,
					background: { r: 255, g: 255, b: 255 },
				})
				.extend({
					top: borderWidth * 2,
					bottom: borderWidth * 2,
					left: borderWidth * 2,
					right: borderWidth * 2,
					background: { r: 0, g: 0, b: 0 },
				})
				.toBuffer();

			// 3. Composite onto white 4x6 canvas
			await sharp({
				create: {
					width: canvasWidth,
					height: canvasHeight,
					channels: 3,
					background: { r: 255, g: 255, b: 255 },
				},
			})
				.composite([{ input: receiptBuffer, gravity: "center" }])
				.jpeg()
				.toFile(processedPath);

			fileToPrint = processedPath;
		} else {
			console.log(`🎨 Resizing for 4R (4x6) Full Page...`);

			await sharp(filepath)
				.resize({
					width: canvasWidth,
					height: canvasHeight,
					fit: "contain",
					background: { r: 255, g: 255, b: 255, alpha: 1 },
				})
				.toFile(processedPath);

			fileToPrint = processedPath;
		}

		getL4260PrinterName((printerName) => {
			// Both modes now use 4x6 paper settings
			const options = `-o media=4x6 -o PageSize=4x6.Borderless -o fit-to-page -o image-position=center`;

			const cmd = `lp -d "${printerName}" ${options} "${fileToPrint}"`;

			if (DEV_MODE) {
				console.log(`\n🛠️  [DEV_MODE] 4R Command: ${cmd}`);
				return; // Keep files for inspection
			}

			if (!printerName) {
				console.log("❌ No printer found.");
				cleanup(filepath, processedPath);
				return;
			}

			console.log(`🖨️  Sending to printer...`);
			exec(cmd, (err) => {
				if (err) console.log("❌ Print Failed:", err.message);
				else console.log("✅ 4R Job sent successfully!");
				cleanup(filepath, processedPath);
			});
		});
	} catch (err) {
		console.log("❌ Error:", err.message);
		if (!DEV_MODE) cleanup(filepath, processedPath);
	}
}

function cleanup(f1, f2) {
	setTimeout(() => {
		if (f1 && fs.existsSync(f1)) fs.unlinkSync(f1);
		if (f2 && fs.existsSync(f2)) fs.unlinkSync(f2);
	}, 5000);
}

// ==================== SOCKET CONNECTION ====================
async function start() {
	const socketUrl = await new Promise((resolve) => {
		rl.question(`Enter Server URL (Default: ${DEFAULT_URL}): `, (url) => {
			resolve(url.trim() || DEFAULT_URL);
		});
	});

	console.log(`\n🔌 Connecting to: ${socketUrl}\n`);
	const socket = io(socketUrl, {
		transports: ["websocket"],
		reconnection: true,
	});

	socket.on("connect", () => {
		socket.emit("join", {
			name: deviceName,
			folder: "/" + deviceName.toLowerCase(),
		});
		console.log(`🟢 Connected! Waiting for commands...`);
	});

	socket.on("chat message", async (data) => {
		const msg = data.msg?.trim();
		if (!msg) return;

		const PREFIX_NORMAL = ":print-";
		const PREFIX_RECEIPT = ":purchase-confirmed-";

		if (msg.toLowerCase().startsWith(PREFIX_RECEIPT)) {
			const id = msg.slice(PREFIX_RECEIPT.length).trim();
			if (id) await downloadAndPrint(id, "RECEIPT");
		} else if (msg.toLowerCase().startsWith(PREFIX_NORMAL)) {
			const id = msg.slice(PREFIX_NORMAL.length).trim();
			if (id) await downloadAndPrint(id, "NORMAL");
		}
	});

	socket.on("disconnect", () => console.log("🔴 Disconnected"));
	socket.on("connect_error", (err) =>
		console.log(`⚠️ Connect Error: ${err.message}`)
	);
}

console.log(`PrinterPC - ${DEV_MODE ? "🛠️ TEST MODE" : "🖨️ LIVE MODE"}`);
start();

// Prevent script from exiting
setInterval(() => {}, 1 << 30);
