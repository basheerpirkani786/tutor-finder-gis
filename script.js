// Global Variables
let map;
let satelliteLayer;
let osmLayer;
let geoserverLayer = null; // Store the GeoServer layer
let currentLayer = 'osm';
let userLocation = null;
let searchAnchor = null; 
let providers = [];
let markers = [];
let searchRadiusCircle = null;
let isPickingLocation = false;
let tempMarker = null;
let routingControl = null;
let currentRouteInstructions = [];
let isEditing = false;
let editId = null;
let isVoiceEnabled = false;

// Config
const DEFAULT_CENTER = { lat: 30.1687, lng: 66.9859 }; 
const CURRENT_USER_KEY = 'tutorFinder_currentUser';

// --- GEOSERVER CONFIGURATION ---
// Ensure 'tutor_gis' matches your Workspace name in GeoServer
// Ensure 'providers' matches your Layer name
const GEOSERVER_URL = 'http://localhost:8080/geoserver/tutor_gis/wms'; 
const GEOSERVER_LAYER_NAME = 'tutor_gis:providers'; 

let currentUser = null; 

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeEventListeners();
    checkAuthSession();
    fetchData(); 
    initChatbot();
});

// --- API HANDLING ---

async function fetchData() {
    try {
        const res = await fetch('/api/providers');
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Server Error (${res.status}): ${errText}`);
        }
        providers = await res.json();
        
        // Clean data
        providers.forEach(p => { 
            p.lat = parseFloat(p.lat); 
            p.lng = parseFloat(p.lng); 
            p.rating = parseFloat(p.rating || 0); 
        });
        
        applyFilters();
    } catch (err) {
        console.error("Fetch Data Failed:", err);
        console.log("Could not load tutors. Check database connection.");
    }
}

// --- AUTH ---
function checkAuthSession() {
    const session = localStorage.getItem(CURRENT_USER_KEY);
    if (session) {
        currentUser = JSON.parse(session);
        updateUIForUser();
    } else updateUIForGuest();
}

async function login(username, password) {
    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password })
        });
        
        const data = await res.json();
        
        if (data.error) {
            alert(data.error); 
        } else if (res.ok) {
            currentUser = data;
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
            updateUIForUser();
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('loginForm').reset();
        }
    } catch (err) { 
        console.error(err);
        alert("Login failed. Check internet connection."); 
    }
}

async function register(username, password, role) {
    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password, role })
        });

        const data = await res.json();

        if (data.error) {
            alert(data.error); 
        } else if (res.ok) {
            currentUser = data; 
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(data));
            updateUIForUser();
            document.getElementById('registerModal').style.display = 'none';
        }
    } catch (err) { 
        console.error(err);
        alert("Registration failed."); 
    }
}

async function resetPassword(username, newPassword) {
    if (!username || !newPassword) {
        alert("Please fill in all fields");
        return;
    }

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset-password', username, password: newPassword })
        });
        
        const data = await res.json();
        
        if (data.error) {
            alert(data.error);
        } else if (data.success) {
            alert("Password reset successful! Please login with your new password.");
            document.getElementById('forgotPasswordModal').style.display = 'none';
            document.getElementById('forgotForm').reset();
            document.getElementById('loginModal').style.display = 'block';
        }
    } catch (err) {
        console.error("Reset Password Error:", err);
        alert("Reset failed. Check connection.");
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);
    updateUIForGuest();
    location.reload(); 
}

function updateUIForUser() {
    document.getElementById('loggedOutView').style.display = 'none';
    document.getElementById('loggedInView').style.display = 'flex';
    document.getElementById('welcomeUser').textContent = `Hi, ${currentUser.username}`;
    if (currentUser.role === 'admin' || currentUser.role === 'provider') 
        document.getElementById('addProviderBtn').style.display = 'inline-block';
    if (currentUser.role === 'admin') 
        document.getElementById('adminPanelBtn').style.display = 'inline-block';
}

function updateUIForGuest() {
    document.getElementById('loggedOutView').style.display = 'block';
    document.getElementById('loggedInView').style.display = 'none';
    document.getElementById('addProviderBtn').style.display = 'none';
    document.getElementById('adminPanelBtn').style.display = 'none';
}

const convertBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsDataURL(file);
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = (error) => reject(error);
    });
};

// --- MAP INIT ---
function initializeMap() {
    map = L.map('map').setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 15);
    searchAnchor = { ...DEFAULT_CENTER };

    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19
    });
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri', maxZoom: 19
    });

    osmLayer.addTo(map);
    updateMapRadius(parseFloat(document.getElementById('searchRadius').value));

    map.on('click', function(e) {
        if (isPickingLocation) {
            updateManualCoordinates(e.latlng.lat, e.latlng.lng);
            confirmLocationPick(e.latlng);
        }
    });
}

// --- NEW FUNCTION: TOGGLE GEOSERVER WMS LAYER ---
function toggleWmsLayer() {
    const btn = document.getElementById('toggleWmsBtn');
    
    if (geoserverLayer) {
        // If layer exists, remove it
        map.removeLayer(geoserverLayer);
        geoserverLayer = null;
        btn.style.border = "none"; // Remove active styling
        console.log("GeoServer layer removed");
    } else {
        // If layer doesn't exist, add it
        geoserverLayer = L.tileLayer.wms(GEOSERVER_URL, {
            layers: GEOSERVER_LAYER_NAME,
            format: 'image/png',
            transparent: true,
            version: '1.1.0',
            attribution: 'GeoServer Data'
        });
        
        geoserverLayer.addTo(map);
        btn.style.border = "2px solid #333"; // Add active styling to button
        console.log("GeoServer layer added");
    }
}

// --- EVENTS ---
function initializeEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('searchRadius').addEventListener('change', applyFilters);
    document.getElementById('locateMe').addEventListener('click', () => locateUser());
    document.getElementById('resetMapBtn').addEventListener('click', resetMapView);
    document.getElementById('setOsmMap').addEventListener('click', () => setBasemap('osm'));
    document.getElementById('setSatelliteMap').addEventListener('click', () => setBasemap('satellite'));
    
    // NEW EVENT: GeoServer Toggle
    document.getElementById('toggleWmsBtn').addEventListener('click', toggleWmsLayer);

    document.getElementById('manualLat').addEventListener('change', handleManualCoordChange);
    document.getElementById('manualLng').addEventListener('change', handleManualCoordChange);
    document.getElementById('addProviderBtn').addEventListener('click', () => openAddProviderModal(false));
    document.getElementById('cancelAdd').addEventListener('click', () => document.getElementById('addProviderModal').style.display = 'none');
    document.getElementById('providerForm').addEventListener('submit', handleProviderSubmit);
    document.getElementById('pickLocationBtn').addEventListener('click', toggleLocationPicker);
    document.getElementById('submitReviewBtn').addEventListener('click', submitReview);
    document.getElementById('deleteProviderBtn').addEventListener('click', deleteCurrentProvider);
    document.getElementById('editProviderBtn').addEventListener('click', editCurrentProvider);
    document.getElementById('getDirectionsBtn').addEventListener('click', function() { if(currentDetailId) routeToShop(currentDetailId); });
    document.getElementById('toggleSpeakerBtn').addEventListener('click', toggleVoice);
    document.getElementById('swapRouteBtn').addEventListener('click', swapRouteDirection);
    document.getElementById('loginBtnNav').addEventListener('click', () => document.getElementById('loginModal').style.display = 'block');
    document.getElementById('registerBtnNav').addEventListener('click', () => document.getElementById('registerModal').style.display = 'block');
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('loginForm').addEventListener('submit', (e) => { e.preventDefault(); login(document.getElementById('loginUsername').value, document.getElementById('loginPassword').value); });
    document.getElementById('registerForm').addEventListener('submit', (e) => { e.preventDefault(); register(document.getElementById('regUsername').value, document.getElementById('regPassword').value, document.getElementById('regRole').value); });
    document.querySelectorAll('.close').forEach(btn => btn.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.style.display = 'none')));
    document.getElementById('adminPanelBtn').addEventListener('click', openAdminPanel);

    if (document.getElementById('forgotPasswordLink')) {
        document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('forgotPasswordModal').style.display = 'block';
        });
    }
    
    if (document.getElementById('forgotForm')) {
        document.getElementById('forgotForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const user = document.getElementById('forgotUsername').value;
            const pass = document.getElementById('newPassword').value;
            resetPassword(user, pass);
        });
    }

    // Admin Click Events
    document.getElementById('statUsers').addEventListener('click', () => loadAdminList('users'));
    document.getElementById('statShops').addEventListener('click', () => loadAdminList('providers'));
}

// --- CHATBOT ---
function initChatbot() {
    const icon = document.getElementById('chatbot-icon');
    const container = document.getElementById('chatbot-container');
    const close = document.getElementById('closeChat');
    const send = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');

    icon.addEventListener('click', () => { container.style.display = 'flex'; icon.style.display = 'none'; });
    close.addEventListener('click', () => { container.style.display = 'none'; icon.style.display = 'flex'; });
    send.addEventListener('click', () => processChat(input));
    input.addEventListener('keypress', (e) => { if(e.key === 'Enter') processChat(input); });
}

function processChat(inputEl) {
    const text = inputEl.value.trim().toLowerCase();
    if(!text) return;
    addChatMsg(text, 'user');
    inputEl.value = '';

    let response = "I'm not sure. Try asking about 'finding tutors', 'registration', or 'fees'.";
    if (text.includes('hi') || text.includes('hello')) response = "Hello! How can I help you find a tutor?";
    else if (text.includes('register') || text.includes('signup')) response = "Click 'Register' in the top right to create an account.";
    else if (text.includes('fee') || text.includes('price')) response = "Fees are listed on each Tutor's profile. Click 'View Profile' on any marker.";
    
    setTimeout(() => addChatMsg(response, 'bot'), 500);
}

function addChatMsg(msg, type) {
    const container = document.getElementById('chatbot-messages');
    const div = document.createElement('div');
    div.className = type === 'user' ? 'user-msg' : 'bot-msg';
    div.textContent = msg;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// --- PROVIDER CRUD ---
function openAddProviderModal(editMode = false, provider = null) {
    const modal = document.getElementById('addProviderModal');
    const form = document.getElementById('providerForm');
    isEditing = editMode;
    
    if (editMode && provider) {
        document.getElementById('modalTitle').textContent = "Edit Tutor Profile";
        document.getElementById('saveProviderBtn').textContent = "Update Profile";
        editId = provider.id;
        
        document.getElementById('providerName').value = provider.name;
        document.getElementById('providerQualification').value = provider.qualification || '';
        document.getElementById('providerExperience').value = provider.experience || '';
        document.getElementById('providerService').value = provider.service;
        document.getElementById('providerFees').value = provider.fees || '';
        document.getElementById('providerTiming').value = provider.timing || '';
        document.getElementById('providerPhone').value = provider.phone;
        document.getElementById('providerAddress').value = provider.address;
        document.getElementById('providerDescription').value = provider.description;
        document.getElementById('manualLat').value = provider.lat;
        document.getElementById('manualLng').value = provider.lng;
        
        document.getElementById('locationStatus').textContent = `${provider.lat}, ${provider.lng}`;
    } else {
        document.getElementById('modalTitle').textContent = "Add Tutor Profile";
        document.getElementById('saveProviderBtn').textContent = "Save Profile";
        form.reset();
        editId = null;
        document.getElementById('locationStatus').textContent = "Not set";
    }
    modal.style.display = 'block';
}

async function handleProviderSubmit(e) {
    e.preventDefault();
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lng = parseFloat(document.getElementById('manualLng').value);
    if (!lat || !lng) { alert("Please set a location."); return; }

    const fileInput = document.getElementById('providerImage');
    let imageBase64 = "";

    if (fileInput.files.length > 0) {
        try { imageBase64 = await convertBase64(fileInput.files[0]); } catch (err) {}
    }

    const providerData = {
        ownerId: currentUser.id,
        name: document.getElementById('providerName').value,
        qualification: document.getElementById('providerQualification').value,
        experience: document.getElementById('providerExperience').value,
        service: document.getElementById('providerService').value,
        fees: document.getElementById('providerFees').value,
        timing: document.getElementById('providerTiming').value,
        phone: document.getElementById('providerPhone').value,
        address: document.getElementById('providerAddress').value,
        description: document.getElementById('providerDescription').value,
        lat: lat, lng: lng, image: imageBase64 
    };

    try {
        let url = '/api/providers';
        let method = 'POST';

        if (isEditing) {
            method = 'PUT';
            providerData.id = editId;
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerData)
        });

        if (res.ok) {
            alert(isEditing ? "Profile Updated!" : "Profile Added!");
            document.getElementById('addProviderModal').style.display = 'none';
            fetchData(); 
        } else {
            alert("Error saving profile");
        }
    } catch(err) {
        console.error(err);
        alert("Server error");
    }
}

function editCurrentProvider() {
    const provider = providers.find(p => p.id === currentDetailId);
    if(provider) {
        document.getElementById('providerDetailsModal').style.display = 'none';
        openAddProviderModal(true, provider);
    }
}

// --- MANUAL COORDINATES ---
function handleManualCoordChange() {
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lng = parseFloat(document.getElementById('manualLng').value);
    if (!isNaN(lat) && !isNaN(lng)) {
        if (tempMarker) map.removeLayer(tempMarker);
        tempMarker = L.marker([lat, lng]).addTo(map).bindPopup("Location Set").openPopup();
        map.setView([lat, lng], 16);
        document.getElementById('locationStatus').textContent = `${lat}, ${lng}`;
    }
}

function updateManualCoordinates(lat, lng) {
    document.getElementById('manualLat').value = lat;
    document.getElementById('manualLng').value = lng;
}

// --- DETAILS & ROUTING ---
let currentDetailId = null;
let routeWaypoints = []; 

function showProviderDetails(providerId) {
    currentDetailId = providerId;
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    document.getElementById('detailName').textContent = provider.name;
    document.getElementById('detailService').textContent = provider.service.toUpperCase();
    document.getElementById('detailPhone').textContent = provider.phone;
    document.getElementById('detailAddress').textContent = provider.address;
    document.getElementById('detailQual').textContent = provider.qualification || "N/A";
    document.getElementById('detailExp').textContent = provider.experience || "N/A";
    document.getElementById('detailFees').textContent = provider.fees || "Contact for fees";
    document.getElementById('detailTiming').textContent = provider.timing || "Contact for timing";
    
    const imgContainer = document.getElementById('detailImageContainer');
    if (provider.image) { document.getElementById('detailImage').src = provider.image; imgContainer.style.display = 'block'; }
    else imgContainer.style.display = 'none';

    const ownerActions = document.getElementById('ownerActions');
    const isOwner = currentUser && (provider.owner_id === currentUser.id); 
    const isAdmin = currentUser && currentUser.role === 'admin';
    ownerActions.style.display = (isOwner || isAdmin) ? 'flex' : 'none';

    renderReviews(provider.userReviews);
    const stars = '★'.repeat(Math.floor(provider.rating)) + '☆'.repeat(5 - Math.floor(provider.rating));
    document.getElementById('detailRating').innerHTML = stars;
    document.getElementById('detailRatingValue').textContent = `(${provider.rating})`;
    
    document.getElementById('reviewSection').style.display = (currentUser && currentUser.role !== 'provider') ? 'block' : 'none';
    document.getElementById('loginToReviewMsg').style.display = (!currentUser) ? 'block' : 'none';

    document.getElementById('providerDetailsModal').style.display = 'block';
}

function routeToShop(providerId) {
    if (!userLocation) {
        alert("Locating you first...");
        locateUser((success) => { if(success) executeRouting(providerId); });
    } else executeRouting(providerId);
}

function executeRouting(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('routingActions').style.display = 'flex';

    routeWaypoints = [
        L.latLng(userLocation.lat, userLocation.lng),
        L.latLng(provider.lat, provider.lng)
    ];
    drawRoute();
}

function drawRoute() {
    if (routingControl) map.removeControl(routingControl);
    
    routingControl = L.Routing.control({
        waypoints: routeWaypoints,
        routeWhileDragging: false,
        lineOptions: { styles: [{color: '#008CBA', opacity: 1, weight: 6}] },
        createMarker: () => null,
        addWaypoints: false, showAlternatives: false
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        currentRouteInstructions = e.routes[0].instructions;
        const summary = e.routes[0].summary;
        if(isVoiceEnabled) {
             speak(`Route calculated. ${Math.round(summary.totalDistance)} meters.`);
        }
    });
}

function swapRouteDirection() {
    if(routeWaypoints.length === 2) {
        routeWaypoints.reverse();
        drawRoute();
        if(isVoiceEnabled) speak("Direction reversed.");
    }
}

// --- VOICE LOGIC ---
function toggleVoice() {
    isVoiceEnabled = !isVoiceEnabled;
    const btn = document.getElementById('toggleSpeakerBtn');
    if (isVoiceEnabled) {
        btn.innerHTML = '<i class="fas fa-volume-up"></i> Voice On';
        btn.style.background = '#27ae60'; 
        speak("Voice navigation enabled.");
    } else {
        btn.innerHTML = '<i class="fas fa-volume-mute"></i> Voice Off';
        btn.style.background = '#95a5a6'; 
        window.speechSynthesis.cancel();
    }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    } else alert("TTS not supported.");
}

// --- UTILS ---
function locateUser(callback) {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            searchAnchor = userLocation;
            map.setView([userLocation.lat, userLocation.lng], 16);
            if(window.userMarker) map.removeLayer(window.userMarker);
            window.userMarker = L.marker([userLocation.lat, userLocation.lng], {
                icon: L.divIcon({ className: 'user-marker', html: '<i class="fas fa-dot-circle" style="color:#4285F4; font-size:24px;"></i>', iconSize: [24, 24] })
            }).addTo(map).bindPopup('You are here');
            if(callback) callback(true);
        },
        () => { alert('Location denied'); if(callback) callback(false); }
    );
}

function toggleLocationPicker() {
    isPickingLocation = true;
    document.getElementById('addProviderModal').style.display = 'none';
    document.getElementById('locationPickerMessage').style.display = 'block';
    document.body.style.cursor = 'crosshair';
}

function confirmLocationPick(latlng) {
    updateManualCoordinates(latlng.lat, latlng.lng);
    document.getElementById('locationStatus').textContent = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(latlng).addTo(map).bindPopup("Location Set").openPopup();
    isPickingLocation = false;
    document.body.style.cursor = 'default';
    document.getElementById('locationPickerMessage').style.display = 'none';
    document.getElementById('addProviderModal').style.display = 'block';
}

function renderReviews(reviews) {
    const list = document.getElementById('reviewsList');
    list.innerHTML = "";
    if(!reviews || reviews.length === 0) list.innerHTML = "<p style='color:#777; font-style:italic;'>No reviews yet.</p>";
    else reviews.forEach(r => {
        const item = document.createElement('div');
        item.className = 'review-item';
        item.innerHTML = `<div class="review-header"><strong>${r.user}</strong><span style="color:#fbbf24;">${'★'.repeat(r.rating)}</span></div><div class="review-text">${r.text}</div>`;
        list.appendChild(item);
    });
}

async function submitReview() {
    if (!currentUser) return; 
    const ratingContainer = document.querySelector('.rating-stars');
    const rating = parseInt(ratingContainer.getAttribute('data-selected-rating') || 0);
    const text = document.getElementById('reviewText').value.trim();
    if (rating === 0) { alert("Select a rating."); return; }
    
    try {
        const res = await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                providerId: currentDetailId, 
                user: currentUser.username, 
                rating, 
                text: text || "No comment." 
            })
        });
        
        if (res.ok) {
            alert("Review submitted!");
            fetchData(); 
            document.getElementById('providerDetailsModal').style.display = 'none';
        }
    } catch (err) { alert("Failed to submit review"); }
}

async function deleteCurrentProvider() {
    if (confirm("Delete this profile?")) {
        try {
            const res = await fetch('/api/providers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentDetailId })
            });
            if(res.ok) {
                alert("Profile Deleted");
                fetchData();
                document.getElementById('providerDetailsModal').style.display = 'none';
            }
        } catch(err) { alert("Delete failed"); }
    }
}

function applyFilters() {
    const serviceType = document.getElementById('serviceType').value;
    const minRating = parseFloat(document.getElementById('ratingFilter').value);
    const radiusKm = parseFloat(document.getElementById('searchRadius').value);
    const centerPoint = L.latLng(searchAnchor.lat, searchAnchor.lng);

    const filtered = providers.filter(p => {
        return ((serviceType === 'all') || (p.service === serviceType)) &&
               (p.rating >= minRating) &&
               (centerPoint.distanceTo(L.latLng(p.lat, p.lng)) <= (radiusKm * 1000));
    });
    renderProvidersList(filtered); addProvidersToMap(filtered);
}

function renderProvidersList(list) {
    const container = document.getElementById('providersContainer');
    container.innerHTML = '';
    if(list.length === 0) container.innerHTML = "<p style='text-align:center; color:#666;'>No tutors found.</p>";
    list.forEach(p => {
         const card = document.createElement('div');
         card.className = 'provider-card';
         card.innerHTML = `<div class="provider-header"><div class="provider-name">${p.name}</div><span class="provider-service">${p.service}</span></div><div class="provider-rating"><span class="stars">${'★'.repeat(Math.floor(p.rating))}</span><span>${p.rating}</span></div><div class="provider-address">${p.address}</div>`;
         card.addEventListener('click', () => { showProviderOnMap(p.id); });
         container.appendChild(card);
    });
}

function addProvidersToMap(list) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    list.forEach(p => {
        const marker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(`<b>${p.name}</b><br><button onclick="showProviderDetails(${p.id})">View Profile</button>`);
        marker.on('click', () => showProviderDetails(p.id));
        markers.push(marker);
    });
}

function showProviderOnMap(id) {
    const p = providers.find(provider => provider.id === id);
    if (p) { map.setView([p.lat, p.lng], 16); showProviderDetails(id); }
}

function updateMapRadius(radiusKm) {
    if (searchRadiusCircle) map.removeLayer(searchRadiusCircle);
    searchRadiusCircle = L.circle([searchAnchor.lat, searchAnchor.lng], { color: '#008CBA', fillColor: '#008CBA', fillOpacity: 0.15, radius: radiusKm * 1000 }).addTo(map);
}

function resetMapView() {
    searchAnchor = { ...DEFAULT_CENTER };
    userLocation = null;
    if (routingControl) map.removeControl(routingControl);
    if (window.userMarker) map.removeLayer(window.userMarker);
    map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 16);
    document.getElementById('searchRadius').value = 1;
    document.getElementById('radiusValue').textContent = "1 km";
    updateMapRadius(1); applyFilters();
}

function setBasemap(layer) {
    if (currentLayer === layer) return;
    if (layer === 'osm') { map.removeLayer(satelliteLayer); map.addLayer(osmLayer); currentLayer = 'osm'; document.getElementById('setOsmMap').classList.add('active'); document.getElementById('setSatelliteMap').classList.remove('active'); }
    else { map.removeLayer(osmLayer); map.addLayer(satelliteLayer); currentLayer = 'satellite'; document.getElementById('setOsmMap').classList.remove('active'); document.getElementById('setSatelliteMap').classList.add('active'); }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    if (query) {
        const filtered = providers.filter(p => p.name.toLowerCase().includes(query) || p.service.toLowerCase().includes(query));
        renderProvidersList(filtered); addProvidersToMap(filtered);
        if (filtered.length > 0) showProviderOnMap(filtered[0].id);
    }
}

// --- ADMIN PANEL (UPDATED) ---
async function openAdminPanel() {
    document.getElementById('adminModal').style.display = 'block';
    
    // Set loading state
    const usersEl = document.getElementById('adminTotalUsers');
    const shopsEl = document.getElementById('adminTotalShops');
    usersEl.textContent = "...";
    shopsEl.textContent = "...";
    document.getElementById('adminListSection').style.display = 'none';

    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            const data = await res.json();
            usersEl.textContent = data.totalUsers;
            shopsEl.textContent = data.totalProviders;
        } else {
            usersEl.textContent = "Error";
            shopsEl.textContent = "Error";
        }
    } catch (err) {
        console.error("Admin stats failed", err);
        usersEl.textContent = "Offline";
    }
}

// Function to fetch and show list (Called by clicking stats cards)
async function loadAdminList(type) {
    const titleEl = document.getElementById('adminListTitle');
    const container = document.getElementById('adminListContainer');
    document.getElementById('adminListSection').style.display = 'block';
    container.innerHTML = "Loading...";
    
    titleEl.textContent = type === 'users' ? "Manage Users" : "Manage Tutors";

    try {
        const res = await fetch(`/api/stats?type=${type}`);
        const list = await res.json();

        container.innerHTML = "";
        if(list.length === 0) {
            container.innerHTML = "<p>No records found.</p>";
            return;
        }

        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'admin-list-item';
            
            // Display different info based on type
            const name = item.username || item.name;
            const sub = item.role ? `(${item.role})` : `(${item.service})`;
            
            div.innerHTML = `
                <div><strong>${name}</strong> <span style="font-size:0.85rem; color:#666;">${sub}</span></div>
                <button class="btn-sm-danger">Delete</button>
            `;
            
            // Add Delete Event
            div.querySelector('button').addEventListener('click', () => deleteAdminItem(type, item.id));
            container.appendChild(div);
        });

    } catch(err) {
        container.innerHTML = "Error loading list.";
    }
}

// Function to delete an item
async function deleteAdminItem(type, id) {
    if(!confirm("Are you sure you want to permanently delete this?")) return;

    try {
        const res = await fetch('/api/stats', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, id })
        });

        if(res.ok) {
            // Refresh counts and list
            openAdminPanel();
            loadAdminList(type); 
        } else {
            alert("Delete failed.");
        }
    } catch(err) {
        alert("Server error during delete.");
    }
}

document.querySelectorAll('.rating-stars .star').forEach(star => {
    star.addEventListener('click', function() {
        const rating = parseInt(this.getAttribute('data-rating'));
        document.querySelectorAll('.rating-stars .star').forEach(s => s.classList.toggle('active', parseInt(s.getAttribute('data-rating')) <= rating));
        this.parentElement.setAttribute('data-selected-rating', rating);
    });
});
