let navigator = "lly";

// === VOLUME BOOST CONTROL ===
// Adjust this value to make sound louder (e.g., 2.0 = twice as loud, 3.0 = three times, etc.)
// Safe range: 1.0 to 4.0 recommended — higher may cause distortion
let volumeBoost = 5.0; // Change this dynamically via UI if desired

// Function to update boost level (call from UI slider, buttons, etc.)
function setVolumeBoost(level) {
	volumeBoost = Math.max(0.1, level); // Prevent complete silence or negative
	// Apply immediately to currently playing audio if any
	if (vn.currentGainNode) {
		vn.currentGainNode.gain.setValueAtTime(
			volumeBoost,
			vn.audioContext.currentTime
		);
	}
}

const voices = {
	lly: [
		"/assets/audio/voices/lly/1. Welcome to the photo booth. I am Mr Marcus Leung. Get ready to capture some amazing memories. Enjoy!.wav",
		"/assets/audio/voices/lly/2. Please choose the frame first, then press the ‘choose this’ button at the right corner.wav",
		"/assets/audio/voices/lly/3. Now please choose the filter, then press the ‘choose this’ button again.wav",
		"/assets/audio/voices/lly/4. We will take 6 photos in total. You can choose 4 of them as your final product.wav",
		"/assets/audio/voices/lly/5. Shot 1! Say cheese!.wav",
		"/assets/audio/voices/lly/6. Great start! Now you have 20 seconds to change your pose or prop.wav",
		"/assets/audio/voices/lly/7. Shot 3! Look at the camera!.wav",
		"/assets/audio/voices/lly/8. Halfway there! 20 seconds to prepare.wav",
		"/assets/audio/voices/lly/9. Shot 4! Smile!.wav",
		"/assets/audio/voices/lly/10. Shot 5! Brilliant!.wav",
		"/assets/audio/voices/lly/11. Almost done! Last chance for a fun pose.wav",
		"/assets/audio/voices/lly/12. Shot 6! Final picture, give us your best shot!.wav",
		"/assets/audio/voices/lly/13. Amazing! That_s a wrap.wav",
		"/assets/audio/voices/lly/14. Thank you. Wait a moment while we process your photos.wav",
	],
	cml: [
		"/assets/audio/voices/cml/1. Welcome.wav",
		"/assets/audio/voices/cml/2. Filter.wav",
		"/assets/audio/voices/cml/3. Photos.wav",
		"/assets/audio/voices/cml/4. Dismiss.wav",
	],
	csl: [
		"/assets/audio/voices/csl/1. Welcome.wav",
		"/assets/audio/voices/csl/2. Filter.wav",
		"/assets/audio/voices/csl/3. Photos.wav",
		"/assets/audio/voices/csl/4. End.wav",
		"/assets/audio/voices/csl/5. Dismiss.wav",
	],
	hht: [
		"/assets/audio/voices/hht/1. Welcome.wav",
		"/assets/audio/voices/hht/2. Filter.wav",
		"/assets/audio/voices/hht/3. Photos.wav",
		"/assets/audio/voices/hht/4. Dismiss.wav",
	],
};

// Web Audio API setup
const vn = {
	audioContext: null,
	currentSource: null, // Current AudioBufferSourceNode
	currentGainNode: null, // Current GainNode for volume control
	_currentNavigator: null, // Track which navigator is playing

	// Lazy initialize AudioContext (must be triggered by user gesture in most browsers)
	_getAudioContext() {
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext ||
				window.webkitAudioContext)();
		}
		return this.audioContext;
	},

	// Stop all playing audio globally
	_stopAll() {
		if (this.currentSource) {
			this.currentSource.stop();
			this.currentSource.disconnect();
			this.currentSource = null;
		}
		if (this.currentGainNode) {
			this.currentGainNode.disconnect();
			this.currentGainNode = null;
		}
		this._currentNavigator = null;
	},

	// Main trigger function with volume boost
	async trigger(navigatorName, index) {
		if (navigator !== navigatorName)
			return Promise.reject(new Error("Navigator mismatch"));
		if (!voices[navigatorName])
			return Promise.reject(
				new Error(`Navigator "${navigatorName}" not found`)
			);

		const url = voices[navigatorName][index - 1];
		if (!url) return Promise.reject(new Error("Index out of bounds"));

		// Stop previous audio before starting new one
		this._stopAll();

		const ctx = this._getAudioContext();
		if (ctx.state === "suspended") await ctx.resume();

		try {
			const response = await fetch(url);
			const arrayBuffer = await response.arrayBuffer();
			const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

			const source = ctx.createBufferSource();
			const gainNode = ctx.createGain();

			source.buffer = audioBuffer;
			gainNode.gain.setValueAtTime(volumeBoost, ctx.currentTime);

			source.connect(gainNode);
			gainNode.connect(ctx.destination);

			this.currentSource = source;
			this.currentGainNode = gainNode;

			return new Promise((resolve) => {
				source.onended = () => {
					// Only clean up if this is still the active source
					if (this.currentSource === source) {
						this.currentSource = null;
						this.currentGainNode = null;
					}
					resolve();
				};
				source.start(0);
			});
		} catch (err) {
			this._stopAll();
			throw err;
		}
	},

	// Shortcut for current navigator
	current(index) {
		return this.trigger(navigator, index);
	},

	// Manual stop all
	stopAll() {
		this._stopAll();
	},

	// Stop only current navigator
	stop() {
		this._stopAll();
	},

	// Update volume boost on currently playing audio
	updateVolumeBoost() {
		if (this.currentGainNode) {
			this.currentGainNode.gain.setValueAtTime(
				volumeBoost,
				this.audioContext.currentTime
			);
		}
	},
};

// === EXAMPLE USAGE ===
// setVolumeBoost(2.5);  // Make it 2.5x louder
// vn.current(1);        // Play welcome message loudly

// Note: First audio play may require a user gesture (click/tap) to unlock AudioContext in some browsers.
// You can call vn._getAudioContext() on first user interaction (e.g., button press) to resume it early.
