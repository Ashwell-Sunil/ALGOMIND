import { animate, scroll, inView } from "https://cdn.jsdelivr.net/npm/motion@11.11.13/+esm";

// Module scripts are automatically deferred, so the DOM is already parsed when this runs.
// ---- Scrollytelling Logic (Image Sequence) ----
    const canvas = document.getElementById('hero-canvas');
    const context = canvas.getContext('2d');
    const scrollContainer = document.querySelector('.scroll-container');
    const heroTitle = document.getElementById('hero-title');
    
    // Configure frames
    const frameCount = 300; // There are 300 frames in the folder
    const currentFrame = index => (
        `photos/scream%20boy%20png/ezgif-frame-${index.toString().padStart(3, '0')}.png`
    );

    const images = [];

    // Preload
    for (let i = 1; i <= frameCount; i++) {
        const img = new Image();
        img.src = currentFrame(i);
        images.push(img);
        
        if (i === 1) {
            img.onload = () => {
                // Set canvas size dynamically based on the frame resolution
                canvas.width = img.naturalWidth || 1920;
                canvas.height = img.naturalHeight || 1080;
                context.drawImage(img, 0, 0);
                heroTitle.classList.add('in-view'); // Animate title in on load
            };
        }
    }

    // Scrubbing & Title Fade
    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const maxScroll = scrollContainer.scrollHeight - window.innerHeight;
        
        const scrollFraction = Math.max(0, Math.min(scrollTop / maxScroll, 1));
        const frameIndex = Math.min(frameCount - 1, Math.floor(scrollFraction * frameCount));
        
        requestAnimationFrame(() => {
            if (images[frameIndex] && images[frameIndex].complete) {
                if (canvas.width !== images[frameIndex].naturalWidth && images[frameIndex].naturalWidth > 0) {
                    canvas.width = images[frameIndex].naturalWidth;
                    canvas.height = images[frameIndex].naturalHeight;
                }
                context.drawImage(images[frameIndex], 0, 0);
            }
        });

    // ---- Motion One Animations ----

    // 1. Animate Title In (On Load)
    animate('#hero-title', 
        { opacity: [0, 1], y: [60, 0] }, 
        { duration: 1, easing: [0.175, 0.885, 0.32, 1.275] }
    );

    // 2. Parallax/Fade Title Out (On Scroll)
    scroll(
        animate('#hero-title', { opacity: [1, 0], y: [0, -150] }),
        {
            target: document.querySelector('.sticky-container'),
            offset: ['start start', 'center start']
        }
    );

    // 3. Reveal Cards with True Spring Physics
    inView('.framer-anim', (info) => {
        animate(info.target, 
            { opacity: [0, 1], y: [100, 0], scale: [0.95, 1] }, 
            { duration: 0.8, easing: "spring", stiffness: 100, damping: 15 }
        );
    }, { margin: "-100px" }); // Trigger slightly after they enter viewport

    // ---- Audio & Mascot Logic ----
    const activateBtn = document.getElementById('activate-btn');
    let audioContext;
    let analyser;
    let microphone;
    let isMicActive = false;
    let mascot;

    activateBtn.addEventListener('click', async () => {
        if (isMicActive) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            mascot = document.createElement('div');
            mascot.id = 'mascot';
            mascot.innerHTML = '🎤';
            document.body.appendChild(mascot);
            
            // Pop in mascot animation with a spring effect
            mascot.style.transform = 'scale(0)';
            setTimeout(() => {
                mascot.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                mascot.style.transform = 'scale(1)';
                
                // Switch back to fast linear transition for snappy audio reactivity
                setTimeout(() => {
                    mascot.style.transition = 'background-color 0.05s linear, transform 0.05s linear';
                }, 500);
            }, 50);
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 1024;
            
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            
            isMicActive = true;
            
            activateBtn.textContent = 'MODE ACTIVE';
            activateBtn.style.opacity = '0.5';
            activateBtn.style.pointerEvents = 'none';
            activateBtn.style.transform = 'scale(0.92) translateY(4px)';
            activateBtn.style.boxShadow = `
                2px 2px 4px rgba(0,0,0,0.3), 
                -2px -2px 4px rgba(255,255,255,0.1),
                inset 6px 6px 12px rgba(0,0,0,0.4),
                inset -6px -6px 12px rgba(255,255,255,0.1)
            `;
            
            startAudioLoop();
            
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("Microphone access is required to activate Screaming Mode!");
        }
    });

    function startAudioLoop() {
        const dataArray = new Uint8Array(analyser.fftSize);
        const quietColor = [79, 195, 247]; // Light Blue
        const loudColor = [239, 83, 80];   // Red
        const noiseFloor = 0.02; // Ignore background hum
        const maxExpectedRms = 0.35; // Maximum shouting volume
        
        function updateMascot() {
            if (!mascot) return;
            
            analyser.getByteTimeDomainData(dataArray);
            
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
                let normalized = (dataArray[i] / 128.0) - 1.0;
                sumSquares += normalized * normalized;
            }
            let rms = Math.sqrt(sumSquares / dataArray.length);
            
            let volume = 0;
            if (rms > noiseFloor) {
                volume = (rms - noiseFloor) / (maxExpectedRms - noiseFloor);
                volume = Math.max(0, Math.min(1, volume));
            }
            
            const scale = 1 + (volume * 1.5);
            
            const r = Math.round(quietColor[0] + (loudColor[0] - quietColor[0]) * volume);
            const g = Math.round(quietColor[1] + (loudColor[1] - quietColor[1]) * volume);
            const b = Math.round(quietColor[2] + (loudColor[2] - quietColor[2]) * volume);
            
            mascot.style.transform = `scale(${scale})`;
            mascot.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            
            // Shift the emoji based on intensity
            if (volume > 0.4) {
                mascot.innerHTML = '🔥';
            } else if (volume > 0.1) {
                mascot.innerHTML = '😮';
            } else {
                mascot.innerHTML = '🎤';
            }
            
            requestAnimationFrame(updateMascot);
        }
        
        updateMascot();
    }
