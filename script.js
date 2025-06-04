// DOM Elements
const imageUpload = document.getElementById('imageUpload');
const imageCanvas = document.getElementById('imageCanvas');
let imageCanvasCtx = imageCanvas.getContext('2d');
const pixelColorDisplay = document.getElementById('pixelColor');
const statusMessages = document.getElementById('statusMessages');
const magnifier = document.getElementById('magnifier');
const magnifierCanvas = document.getElementById('magnifierCanvas');
const magnifierCtx = magnifierCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');

const rotateRPlus90Btn = document.getElementById('rotateRPlus90');
const rotateRMinus90Btn = document.getElementById('rotateRMinus90');
const rotateGPlus90Btn = document.getElementById('rotateGPlus90');
const rotateGMinus90Btn = document.getElementById('rotateGMinus90');
const rotateBPlus90Btn = document.getElementById('rotateBPlus90');
const rotateBMinus90Btn = document.getElementById('rotateBMinus90');
const dragRotateToggleBtn = document.getElementById('dragRotateToggle');

let currentImageData = null;
let selectedPixelColor = null;
let selectedPixelCoords = null;

const magnifierSize = 100;
const zoomFactor = 5;
const pixelatedPreviewSize = Math.floor(magnifierSize / zoomFactor);

let scene, camera, renderer, orbitControls, colorPoint = null;
let labelR, labelG, labelB;

let isDragRotateModeActive = false;
let originalImageDataForRotate = null;
let selectedPixelOriginalColorForRotate = null;
let currentTotalRotation = new THREE.Quaternion();
const dragStartMouse = new THREE.Vector2();
const rotationCenter = new THREE.Vector3(127.5, 127.5, 127.5);
let isDraggingGraph = false;

magnifierCanvas.width = magnifierSize;
magnifierCanvas.height = magnifierSize;
magnifierCtx.imageSmoothingEnabled = false;
if (magnifierCtx.mozImageSmoothingEnabled !== undefined) magnifierCtx.mozImageSmoothingEnabled = false;
if (magnifierCtx.webkitImageSmoothingEnabled !== undefined) magnifierCtx.webkitImageSmoothingEnabled = false;
if (magnifierCtx.msImageSmoothingEnabled !== undefined) magnifierCtx.msImageSmoothingEnabled = false;

// Centralized function to clear image-related state
function clearImageState() {
    if(imageCanvasCtx) imageCanvasCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    currentImageData = null;
    selectedPixelColor = null; // Clear selected pixel color
    selectedPixelCoords = null; // Clear selected pixel coordinates
    pixelColorDisplay.textContent = ''; // Clear pixel color display
    if (colorPoint) { // Ensure 3D point is hidden
        colorPoint.visible = false;
    }
    // If drag rotate mode is active, deactivate it
    if (isDragRotateModeActive) {
        isDragRotateModeActive = false; // Set before updating UI to prevent issues
        dragRotateToggleBtn.textContent = "Enable Color Drag-Rotate";
        dragRotateToggleBtn.classList.remove('active');
        if(orbitControls) orbitControls.enabled = true;
        graphCanvas.style.cursor = (orbitControls && orbitControls.enabled ? 'grab' : 'default');
        originalImageDataForRotate = null;
        selectedPixelOriginalColorForRotate = null;
        currentTotalRotation.identity();
        // statusMessages.textContent = "Drag-Rotate mode deactivated due to image change/error."; // Set specific message if needed
    }
}

imageUpload.addEventListener('change', function(event) {
    if (isDragRotateModeActive) {
        // Deactivate drag rotate mode (will also call parts of clearImageState)
        // but call clearImageState first to ensure full reset before new image load sequence
        clearImageState();
        statusMessages.textContent = "Drag-Rotate mode deactivated. Loading new image...";
    } else {
        // If not in drag rotate mode, still clear previous image state
        clearImageState();
    }


    const file = event.target.files[0];
    if (!file) {
        // User cancelled file selection, or no file was chosen
        // statusMessages.textContent = 'No file selected.'; // Optional: can be annoying if they just cancelled.
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            imageCanvasCtx = imageCanvas.getContext('2d');
            const maxWidth = 500;
            const maxHeight = 500;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
            } else {
                if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
            }
            imageCanvas.width = width;
            imageCanvas.height = height;
            imageCanvasCtx.drawImage(img, 0, 0, width, height);
            try {
                currentImageData = imageCanvasCtx.getImageData(0, 0, width, height);
                // Clear previous selections explicitly as clearImageState might have been for a prior image.
                selectedPixelColor = null;
                selectedPixelCoords = null;
                pixelColorDisplay.textContent = '';
                if (colorPoint) colorPoint.visible = false;
                statusMessages.textContent = 'Image loaded. Hover to magnify, click to select a pixel.'; // Refined message
            } catch (err) {
                console.error("Error getting image data:", err);
                clearImageState(); // Full clear on error
                statusMessages.textContent = 'Error: Could not process image data. It might be corrupted or from a restricted source.';
            }
        };
        img.onerror = function() {
            clearImageState(); // Full clear on error
            statusMessages.textContent = 'Error: Could not load the image file. Please try a different file (e.g., JPG, PNG).';
        };
        img.src = e.target.result;
    };
    reader.onerror = function() {
        clearImageState(); // Full clear on error
        statusMessages.textContent = 'Error: Failed to read the selected file.';
    };
    reader.readAsDataURL(file);
});

imageCanvas.addEventListener('mouseenter', () => { if (currentImageData) magnifier.style.display = 'block'; });
// Modified: Only hide magnifier, keep pixel info
imageCanvas.addEventListener('mouseleave', () => {
    magnifier.style.display = 'none';
});
imageCanvas.addEventListener('mousemove', event => {
    if (!currentImageData) { magnifier.style.display = 'none'; return; }
    if (magnifier.style.display !== 'block') magnifier.style.display = 'block';
    const rect = imageCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    magnifier.style.left = (event.pageX + 15) + 'px';
    magnifier.style.top = (event.pageY + 15) + 'px';
    const sourceX = Math.floor(x - pixelatedPreviewSize / 2);
    const sourceY = Math.floor(y - pixelatedPreviewSize / 2);
    magnifierCtx.clearRect(0, 0, magnifierSize, magnifierSize);
    magnifierCtx.drawImage(imageCanvas,
        Math.max(0, Math.min(sourceX, imageCanvas.width - pixelatedPreviewSize)),
        Math.max(0, Math.min(sourceY, imageCanvas.height - pixelatedPreviewSize)),
        pixelatedPreviewSize, pixelatedPreviewSize, 0, 0, magnifierSize, magnifierSize);
    magnifierCtx.strokeStyle = 'red';
    magnifierCtx.lineWidth = 1;
    magnifierCtx.strokeRect(magnifierSize / 2 - zoomFactor / 2, magnifierSize / 2 - zoomFactor / 2, zoomFactor, zoomFactor);
});

imageCanvas.addEventListener('click', event => {
    if (isDragRotateModeActive) {
        statusMessages.textContent = "Action blocked: Disable Color Drag-Rotate mode to select a new anchor pixel.";
        return;
    }
    if (!currentImageData) { statusMessages.textContent = 'Error: Please upload an image first.'; return; }

    const rect = imageCanvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const x = Math.floor(canvasX);
    const y = Math.floor(canvasY);

    if (x < 0 || x >= currentImageData.width || y < 0 || y >= currentImageData.height) {
        // Clicked outside bounds, clear previous selection if any
        selectedPixelColor = null;
        selectedPixelCoords = null;
        pixelColorDisplay.textContent = 'Clicked outside image bounds.';
        if(colorPoint) colorPoint.visible = false; // Hide 3D point
        return;
    }

    const index = (y * currentImageData.width + x) * 4;
    const r = currentImageData.data[index];
    const g = currentImageData.data[index + 1];
    const b = currentImageData.data[index + 2];
    selectedPixelColor = { r, g, b };
    selectedPixelCoords = { x, y };
    pixelColorDisplay.textContent = `R: ${r}, G: ${g}, B: ${b} at [${x}, ${y}]`;

    if (colorPoint) {
        colorPoint.material.color.setRGB(r / 255, g / 255, b / 255);
        colorPoint.position.set(r, g, b);
        colorPoint.visible = true; // Verified: Ensure point is visible on new selection
        statusMessages.textContent = `Selected pixel: (${r},${g},${b}). Point updated in graph.`;
    } else {
        statusMessages.textContent = `Selected pixel: (${r},${g},${b}). Graph not ready.`;
    }
});

function applyFixedTransformation(type) {
    if (isDragRotateModeActive) {
        statusMessages.textContent = "Action blocked: Disable Color Drag-Rotate mode first.";
        return;
    }
    if (!currentImageData) {
        statusMessages.textContent = 'Error: Please upload an image first to apply transformations.';
        return;
    }
    if (!imageCanvasCtx) {
        imageCanvasCtx = imageCanvas.getContext('2d');
        if (!imageCanvasCtx) { statusMessages.textContent = 'Error: Cannot get canvas context.'; return; }
    }
    const data = currentImageData.data;
    const width = currentImageData.width;
    for (let i = 0; i < data.length; i += 4) {
        const r_old = data[i];
        const g_old = data[i + 1];
        const b_old = data[i + 2];
        let r_new, g_new, b_new;
        switch (type) {
            case 'R_PLUS_90':  r_new = r_old; g_new = b_old;       b_new = 255 - g_old; break;
            case 'R_MINUS_90': r_new = r_old; g_new = 255 - b_old; b_new = g_old;       break;
            case 'G_PLUS_90':  r_new = 255 - b_old; g_new = g_old; b_new = r_old;       break;
            case 'G_MINUS_90': r_new = b_old;       g_new = g_old; b_new = 255 - r_old; break;
            case 'B_PLUS_90':  r_new = g_old;       g_new = 255 - r_old; b_new = b_old; break;
            case 'B_MINUS_90': r_new = 255 - g_old; g_new = r_old;       b_new = b_old; break;
            default: console.error('Unknown transformation:', type); statusMessages.textContent = `Error: Unknown transformation type '${type}'.`; return;
        }
        data[i]     = Math.max(0, Math.min(255, Math.round(r_new)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(g_new)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(b_new)));
    }
    imageCanvasCtx.putImageData(currentImageData, 0, 0);
    statusMessages.textContent = `Image colors transformed: ${type.replace(/_/g, ' ')}.`;
    if (selectedPixelCoords && selectedPixelColor) { // Check selectedPixelColor as well for safety
        const { x, y } = selectedPixelCoords;
        const index = (y * width + x) * 4;
        const newR = data[index];
        const newG = data[index + 1];
        const newB = data[index + 2];
        selectedPixelColor = { r: newR, g: newG, b: newB };
        pixelColorDisplay.textContent = `R: ${newR}, G: ${newG}, B: ${newB} (at ${x},${y})`;
        if (colorPoint) {
            colorPoint.material.color.setRGB(newR / 255, newG / 255, newB / 255);
            colorPoint.position.set(newR, newG, newB);
            colorPoint.visible = true; // Ensure it's visible after transformation
        }
    }
}

function applyDragRotationToImageAndPoint() {
    if (!originalImageDataForRotate || !currentImageData) return;
    const originalData = originalImageDataForRotate;
    const transformedData = currentImageData.data;
    const tempVector = new THREE.Vector3();
    for (let i = 0; i < originalData.length; i += 4) {
        tempVector.set(originalData[i], originalData[i + 1], originalData[i + 2]);
        tempVector.sub(rotationCenter);
        tempVector.applyQuaternion(currentTotalRotation);
        tempVector.add(rotationCenter);
        transformedData[i]     = Math.max(0, Math.min(255, Math.round(tempVector.x)));
        transformedData[i + 1] = Math.max(0, Math.min(255, Math.round(tempVector.y)));
        transformedData[i + 2] = Math.max(0, Math.min(255, Math.round(tempVector.z)));
        transformedData[i+3] = originalData[i+3];
    }
    imageCanvasCtx.putImageData(currentImageData, 0, 0);
    if (selectedPixelOriginalColorForRotate && selectedPixelCoords) {
        const { r_orig, g_orig, b_orig } = selectedPixelOriginalColorForRotate;
        tempVector.set(r_orig, g_orig, b_orig);
        tempVector.sub(rotationCenter);
        tempVector.applyQuaternion(currentTotalRotation);
        tempVector.add(rotationCenter);
        const newR = Math.max(0, Math.min(255, Math.round(tempVector.x)));
        const newG = Math.max(0, Math.min(255, Math.round(tempVector.y)));
        const newB = Math.max(0, Math.min(255, Math.round(tempVector.z)));
        selectedPixelColor = { r: newR, g: newG, b: newB };
        pixelColorDisplay.textContent = `R: ${newR}, G: ${newG}, B: ${newB} (at ${selectedPixelCoords.x},${selectedPixelCoords.y}) (rotated)`;
        if (colorPoint) {
            colorPoint.material.color.setRGB(newR / 255, newG / 255, newB / 255);
            colorPoint.position.set(newR, newG, newB);
            colorPoint.visible = true; // Ensure visible during drag
        }
    }
}

dragRotateToggleBtn.addEventListener('click', () => {
    if (!isDragRotateModeActive) {
        if (!currentImageData) {
            statusMessages.textContent = "Error: Please upload an image first.";
            return;
        }
        if (!selectedPixelColor || !selectedPixelCoords) { // Check both
            statusMessages.textContent = "Error: Please select an anchor pixel on the image first.";
            return;
        }
        isDragRotateModeActive = true;
        originalImageDataForRotate = new Uint8ClampedArray(currentImageData.data);
        selectedPixelOriginalColorForRotate = { ...selectedPixelColor };
        currentTotalRotation.identity();
        if(orbitControls) orbitControls.enabled = false;
        dragRotateToggleBtn.textContent = "Disable Color Drag-Rotate";
        dragRotateToggleBtn.classList.add('active');
        statusMessages.textContent = "Drag-Rotate ENABLED. Drag on the 3D graph to rotate colors.";
        graphCanvas.style.cursor = 'grab';
    } else {
        isDragRotateModeActive = false; // Set before other UI updates
        if(orbitControls) orbitControls.enabled = true;
        dragRotateToggleBtn.textContent = "Enable Color Drag-Rotate";
        dragRotateToggleBtn.classList.remove('active');
        statusMessages.textContent = "Drag-Rotate DISABLED. Image retains last rotated state.";
        graphCanvas.style.cursor = (orbitControls && orbitControls.enabled ? 'grab' : 'default');
        originalImageDataForRotate = null;
        selectedPixelOriginalColorForRotate = null;
        currentTotalRotation.identity();
    }
});

graphCanvas.addEventListener('mousedown', (event) => {
    if (!isDragRotateModeActive || !currentImageData) return;
    isDraggingGraph = true;
    dragStartMouse.set(event.clientX, event.clientY);
    graphCanvas.style.cursor = 'grabbing';
    event.preventDefault();
    window.addEventListener('mousemove', handleGraphDragMove);
    window.addEventListener('mouseup', handleGraphDragUp);
});

function handleGraphDragMove(event) {
    if (!isDragRotateModeActive || !isDraggingGraph || !currentImageData) return;
    event.preventDefault();
    const deltaX = event.clientX - dragStartMouse.x;
    const deltaY = event.clientY - dragStartMouse.y;
    const sensitivity = 0.008;
    const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * sensitivity);
    const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * sensitivity);
    const deltaRotation = new THREE.Quaternion().multiplyQuaternions(quatY, quatX);
    currentTotalRotation.premultiply(deltaRotation);
    applyDragRotationToImageAndPoint();
    dragStartMouse.set(event.clientX, event.clientY);
}

function handleGraphDragUp(event) {
    if (!isDragRotateModeActive || !isDraggingGraph) return; // Check isDragRotateModeActive as well
    event.preventDefault();
    isDraggingGraph = false;
    graphCanvas.style.cursor = isDragRotateModeActive ? 'grab' : (orbitControls && orbitControls.enabled ? 'grab' : 'default');
    window.removeEventListener('mousemove', handleGraphDragMove);
    window.removeEventListener('mouseup', handleGraphDragUp);
}

function init3DGraph() {
    if (!graphCanvas) { console.error("graphCanvas not found!"); return; }
    labelR = document.getElementById('labelR');
    labelG = document.getElementById('labelG');
    labelB = document.getElementById('labelB');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    camera = new THREE.PerspectiveCamera(75, graphCanvas.clientWidth / graphCanvas.clientHeight, 0.1, 1000);
    camera.position.set(128, 128, 350);
    camera.lookAt(127.5, 127.5, 127.5);
    renderer = new THREE.WebGLRenderer({ canvas: graphCanvas, antialias: true });
    renderer.setSize(graphCanvas.clientWidth, graphCanvas.clientHeight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(150, 350, 250);
    scene.add(directionalLight);
    function createAxis(color, from, to) {
        const material = new THREE.LineBasicMaterial({ color: color });
        const points = [from, to];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        scene.add(new THREE.Line(geometry, material));
    }
    const axisLength = 280;
    createAxis(0xff0000, new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLength, 0, 0));
    createAxis(0x00ff00, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLength, 0));
    createAxis(0x0000ff, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLength));
    const boxGeom = new THREE.BoxGeometry(255, 255, 255);
    const boxEdges = new THREE.EdgesGeometry(boxGeom);
    const boxLine = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 2 }));
    boxLine.position.set(127.5, 127.5, 127.5);
    scene.add(boxLine);
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.target.set(127.5, 127.5, 127.5);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.screenSpacePanning = false;
    orbitControls.minDistance = 50;
    orbitControls.maxDistance = 700;
    orbitControls.addEventListener('change', updateAxisLabels);
    graphCanvas.style.cursor = 'grab';
    const pointGeometry = new THREE.SphereGeometry(6, 32, 32);
    const pointMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 50 });
    colorPoint = new THREE.Mesh(pointGeometry, pointMaterial);
    colorPoint.visible = false;
    scene.add(colorPoint);
    animate3DGraph();
    updateAxisLabels();
}

function animate3DGraph() {
    requestAnimationFrame(animate3DGraph);
    if(orbitControls && orbitControls.enabled) orbitControls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = graphCanvas.clientWidth / graphCanvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(graphCanvas.clientWidth, graphCanvas.clientHeight);
    updateAxisLabels();
}

const axisEndpoints = { R: new THREE.Vector3(290, 0, 0), G: new THREE.Vector3(0, 290, 0), B: new THREE.Vector3(0, 0, 290) };
function updateAxisLabels() {
    if (!camera || !graphCanvas || !labelR || !labelG || !labelB) return;
    const canvasRect = graphCanvas.getBoundingClientRect();
    function projectToScreen(point3D, labelElement) {
        const vector = point3D.clone().project(camera);
        const x = (vector.x * 0.5 + 0.5) * graphCanvas.clientWidth;
        const y = (-vector.y * 0.5 + 0.5) * graphCanvas.clientHeight;
        if (x >= 0 && x <= graphCanvas.clientWidth && y >= 0 && y <= graphCanvas.clientHeight && vector.z < 1) {
            labelElement.style.display = 'block';
            labelElement.style.left = `${canvasRect.left + x}px`;
            labelElement.style.top = `${canvasRect.top + y}px`;
        } else {
            labelElement.style.display = 'none';
        }
    }
    projectToScreen(axisEndpoints.R, labelR);
    projectToScreen(axisEndpoints.G, labelG);
    projectToScreen(axisEndpoints.B, labelB);
}

document.addEventListener('DOMContentLoaded', () => {
    imageCanvasCtx = imageCanvas.getContext('2d');
    if (rotateRPlus90Btn) rotateRPlus90Btn.addEventListener('click', () => applyFixedTransformation('R_PLUS_90'));
    if (rotateRMinus90Btn) rotateRMinus90Btn.addEventListener('click', () => applyFixedTransformation('R_MINUS_90'));
    if (rotateGPlus90Btn) rotateGPlus90Btn.addEventListener('click', () => applyFixedTransformation('G_PLUS_90'));
    if (rotateGMinus90Btn) rotateGMinus90Btn.addEventListener('click', () => applyFixedTransformation('G_MINUS_90'));
    if (rotateBPlus90Btn) rotateBPlus90Btn.addEventListener('click', () => applyFixedTransformation('B_PLUS_90'));
    if (rotateBMinus90Btn) rotateBMinus90Btn.addEventListener('click', () => applyFixedTransformation('B_MINUS_90'));
    init3DGraph();
    statusMessages.textContent = "Ready. Upload an image to start.";
    console.log("Interactive Pixel Color Visualizer initialized.");
});
console.log("script.js parsed and executed.");
