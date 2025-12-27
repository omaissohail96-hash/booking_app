// API Base URL (follows whatever port the server uses)
const API_BASE = `${window.location.origin}/api`;

// State
let currentValidation = null;
let currentMonth = new Date();
let bookingsCache = {};

// Custom Modal Functions
function showModal(title, message, showCancel = false, icon = '') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');
        
        // Add icon if provided
        const iconHtml = icon ? `<span class="modal-icon">${icon}</span>` : '';
        modalTitle.innerHTML = iconHtml + title;
        modalMessage.innerHTML = message;
        
        if (showCancel) {
            cancelBtn.style.display = 'block';
            confirmBtn.textContent = 'Yes';
            cancelBtn.textContent = 'No';
        } else {
            cancelBtn.style.display = 'none';
            confirmBtn.textContent = 'OK';
        }
        
        modal.style.display = 'flex';
        
        const handleConfirm = () => {
            modal.style.display = 'none';
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            modal.style.display = 'none';
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        
        // Close on overlay click for non-confirm modals
        if (!showCancel) {
            const overlay = modal.querySelector('.modal-overlay');
            const handleOverlayClick = () => {
                modal.style.display = 'none';
                cleanup();
                overlay.removeEventListener('click', handleOverlayClick);
                resolve(false);
            };
            overlay.addEventListener('click', handleOverlayClick);
        }
    });
}

function showAlert(message, title = 'Notice', icon = 'ℹ️') {
    return showModal(title, message, false, icon);
}

function showConfirm(message, title = 'Confirm', icon = '❓') {
    return showModal(title, message, true, icon);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    initializeCalendar();
    loadTodayBookings();
    loadWeekPlan();
    loadCompletedBookings();
    loadCancelledBookings();
    setMinDate();
    initializeWeekDayFilter();
});

// Set minimum date to today
function setMinDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bookingDate').min = today;
    document.getElementById('bookingDate').value = today;
}

// Initialize week day filter
function initializeWeekDayFilter() {
    document.getElementById('weekDayFilter').addEventListener('change', (e) => {
        const selectedDay = e.target.value;
        const cards = document.querySelectorAll('.week-day-card');

        cards.forEach(card => {
            const title = card.querySelector('.week-day-title').innerText;
            card.style.display =
                selectedDay === 'all' || title.includes(selectedDay)
                    ? 'block'
                    : 'none';
        });
    });
}

// Initialize form handlers
function initializeForm() {
    const form = document.getElementById('bookingForm');
    const validateBtn = document.getElementById('validateBtn');
    const submitBtn = document.getElementById('submitBtn');
    const autoScheduleBtn = document.getElementById('autoScheduleBtn');

    validateBtn.addEventListener('click', validateBooking);
    autoScheduleBtn.addEventListener('click', autoScheduleBooking);
    form.addEventListener('submit', submitBooking);

    // Reset validation when form changes
    form.addEventListener('input', () => {
        currentValidation = null;
        submitBtn.disabled = true;
        hideValidationMessage();
    });
}

// Auto schedule booking
async function autoScheduleBooking() {
    const formData = getFormData();

    if (!formData.customer_name || !formData.address) {
        showValidationMessage('Customer name and service address are required before auto scheduling.', 'error');
        return;
    }

    showLoading(true);

    try {
        const payload = {
            customer_name: formData.customer_name,
            address: formData.address,
            service_type: formData.service_type,
            preferred_start_date: formData.booking_date
        };

        const response = await fetch(`${API_BASE}/auto-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success && result.autoSchedule) {
            const suggestion = result.autoSchedule;
            document.getElementById('bookingDate').value = suggestion.booking_date;
            document.getElementById('bookingTime').value = suggestion.booking_time;

            currentValidation = suggestion;
            const summary = buildAutoScheduleMessage(suggestion);
            showValidationMessage(summary, 'info');
            document.getElementById('submitBtn').disabled = false;
        } else {
            showValidationMessage(result.error || 'Unable to auto schedule this address.', 'error');
        }
    } catch (error) {
        console.error('Auto schedule error:', error);
        showValidationMessage('Failed to auto schedule. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Validate booking
async function validateBooking() {
    const formData = getFormData();
    
    if (!formData.customer_name || !formData.address || !formData.booking_date) {
        showValidationMessage('Please fill in all required fields', 'error');
        return;
    }

    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/validate-booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (result.success) {
            currentValidation = result.validation;
            displayValidationResult(result.validation);
        } else {
            showValidationMessage('Validation failed: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Validation error:', error);
        showValidationMessage('Failed to validate booking. Please check your connection.', 'error');
    } finally {
        showLoading(false);
    }
}

// Display validation result
function displayValidationResult(validation) {
    const submitBtn = document.getElementById('submitBtn');
    
    if (validation.valid) {
        let message = `✓ ${validation.message}`;
        
        if (validation.isAnchor) {
            message += '<br><strong>This will set the route for this day.</strong>';
        } else {
            message += `<br>📏 ${validation.distanceFromAnchor} miles from anchor booking`;
            message += `<br>⏱️ ~${validation.travelTimeFromAnchor} min travel time`;
        }
        
        message += `<br>🚗 ${validation.distanceFromLowell} miles from Lowell`;
        
        showValidationMessage(message, 'success');
        submitBtn.disabled = false;
    } else {
        let message = `✗ ${validation.message}`;
        
        if (validation.alternateDate) {
            message += `<div class="alternate-date">`;
            message += `💡 Suggested: ${formatDate(validation.alternateDate.date)}`;
            message += `<br>${validation.alternateDate.reason}`;
            message += `</div>`;
        }
        
        const type = validation.reason === 'outside_service_area' ? 'error' : 'warning';
        showValidationMessage(message, type);
        submitBtn.disabled = true;
    }
}

// Submit booking
async function submitBooking(e) {
    e.preventDefault();
    
    if (!currentValidation || !currentValidation.valid) {
        showValidationMessage('Please validate the booking first', 'warning');
        return;
    }

    showLoading(true);
    
    try {
        const formData = getFormData();
        
        const response = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (result.success) {
            showValidationMessage('✓ Booking confirmed successfully!', 'success');
            document.getElementById('bookingForm').reset();
            currentValidation = null;
            document.getElementById('submitBtn').disabled = true;
            
            // Refresh displays
            await loadTodayBookings();
            await loadCalendar();
            await loadWeekPlan();
            
            await showAlert('Booking created successfully!', 'Success', '✅');
            setTimeout(() => hideValidationMessage(), 3000);
        } else {
            showValidationMessage('Failed to create booking: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Submission error:', error);
        await showAlert('Failed to submit booking. Please try again.', 'Error', '❌');
        showValidationMessage('Failed to submit booking. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Get form data
function getFormData() {
    return {
        customer_name: document.getElementById('customerName').value,
        customer_phone: '',
        customer_email: '',
        address: document.getElementById('address').value,
        booking_date: document.getElementById('bookingDate').value,
        booking_time: document.getElementById('bookingTime').value,
        service_type: document.getElementById('serviceType').value,
        notes: ''
    };
}

// Initialize calendar
function initializeCalendar() {
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        loadCalendar();
    });
    
    document.getElementById('nextMonth').addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        loadCalendar();
    });
    
    loadCalendar();
}

// Load calendar
async function loadCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Update month display
    document.getElementById('currentMonth').textContent = 
        currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Get first and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Fetch bookings for the month
    const startDate = formatDateISO(firstDay);
    const endDate = formatDateISO(lastDay);
    
    try {
        const response = await fetch(`${API_BASE}/bookings/range/${startDate}/${endDate}`);
        const result = await response.json();
        
        if (result.success) {
            // Group bookings by date
            bookingsCache = {};
            result.data.forEach(booking => {
                if (!bookingsCache[booking.booking_date]) {
                    bookingsCache[booking.booking_date] = [];
                }
                bookingsCache[booking.booking_date].push(booking);
            });
            
            renderCalendar(year, month);
        }
    } catch (error) {
        console.error('Failed to load calendar:', error);
    }
}

// Render calendar
function renderCalendar(year, month) {
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    
    // Day headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day header';
        header.textContent = day;
        calendar.appendChild(header);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        calendar.appendChild(empty);
    }
    
    // Days of month
    for (let day = 1; day <= numDays; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDateISO(date);
        const bookings = bookingsCache[dateStr] || [];
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        
        // Add classes
        if (date < today) {
            dayEl.classList.add('past');
        } else if (date.getTime() === today.getTime()) {
            dayEl.classList.add('today');
        }
        
        // Booking status
        if (bookings.length === 0) {
            dayEl.classList.add('available');
        } else if (bookings.length >= 3) {
            dayEl.classList.add('full');
        } else {
            dayEl.classList.add('partial');
        }
        
        // Content
        const dateDiv = document.createElement('div');
        dateDiv.className = 'date';
        dateDiv.textContent = day;
        dayEl.appendChild(dateDiv);
        
        if (bookings.length > 0) {
            const countDiv = document.createElement('div');
            countDiv.className = 'count';
            countDiv.textContent = `${bookings.length}/3`;
            dayEl.appendChild(countDiv);
        }
        
        // Click handler
        if (date >= today) {
            dayEl.addEventListener('click', () => selectDate(dateStr));
        }
        
        calendar.appendChild(dayEl);
    }
}

// Select date from calendar
function selectDate(dateStr) {
    document.getElementById('bookingDate').value = dateStr;
    currentValidation = null;
    document.getElementById('submitBtn').disabled = true;
    hideValidationMessage();
}

// Load today's bookings
async function loadTodayBookings() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const response = await fetch(`${API_BASE}/bookings/date/${today}`);
        const result = await response.json();
        
        if (result.success) {
            displayBookings(result.data, result.stats);
        }
    } catch (error) {
        console.error('Failed to load bookings:', error);
    }
}

// Display bookings
function displayBookings(bookings, stats) {
    const container = document.getElementById('todayBookings');
    
    if (bookings.length === 0) {
        container.innerHTML = '<div class="no-bookings">No bookings for today</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Add stats header
    const statsDiv = document.createElement('div');
    statsDiv.style.marginBottom = '20px';
    statsDiv.style.padding = '15px';
    statsDiv.style.background = '#e3f2fd';
    statsDiv.style.borderRadius = '8px';
    statsDiv.innerHTML = `
        <strong>📊 Today's Stats:</strong>
        ${bookings.length}/${stats.capacity} bookings
        ${stats.hasAnchor ? `<br>⚓ Anchor: ${stats.anchorAddress}` : ''}
    `;
    container.appendChild(statsDiv);
    
    // Add booking cards
    bookings.forEach(booking => {
        const card = createBookingCard(booking);
        container.appendChild(card);
    });
}

// Create booking card
function createBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card';
    if (booking.is_anchor) {
        card.classList.add('anchor');
    }
    
    card.innerHTML = `
        <div class="booking-header">
            <div class="booking-customer">${booking.customer_name}</div>
            <div class="booking-time">${formatTime(booking.booking_time)}</div>
        </div>
        <div class="booking-details">
            <div class="booking-detail">📍 ${booking.address}</div>
            <div class="booking-detail">🚗 ${booking.distance_from_lowell} miles from base</div>
            ${booking.distance_from_anchor ? 
                `<div class="booking-detail">📏 ${booking.distance_from_anchor} miles from anchor</div>` : ''}
            ${booking.customer_phone ? 
                `<div class="booking-detail">📞 ${booking.customer_phone}</div>` : ''}
            ${booking.service_type ? 
                `<div class="booking-detail">🧽 ${capitalizeFirst(booking.service_type)} Service</div>` : ''}
        </div>
        <div class="booking-actions">
            <button class="btn btn-small btn-success" onclick="completeBooking(${booking.id})">
                ✓ Complete
            </button>
            <button class="btn btn-small btn-warning" onclick="cancelBooking(${booking.id})">
                Cancel
            </button>
            <button class="btn btn-small btn-secondary" onclick="deleteBooking(${booking.id})">
                Delete
            </button>
        </div>
    `;
    
    return card;
}

// Delete booking
async function deleteBooking(id) {
    const confirmed = await showConfirm('Are you sure you want to delete this booking? This action cannot be undone.', 'Delete Booking', '🗑️');
    if (!confirmed) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/bookings/${id}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadTodayBookings();
            await loadCalendar();
            await loadWeekPlan();
            await showAlert('Booking deleted successfully.', 'Success', '✅');
        } else {
            await showAlert('Failed to delete booking. Please try again.', 'Error', '❌');
        }
    } catch (error) {
        console.error('Delete error:', error);
        await showAlert('Failed to delete booking. Please try again.', 'Error', '❌');
    } finally {
        showLoading(false);
    }
}

// Cancel booking
async function cancelBooking(id) {
    const confirmed = await showConfirm('Are you sure you want to cancel this booking? It will be moved to cancelled bookings and the time slot will become available.', 'Cancel Booking', '⚠️');
    if (!confirmed) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/bookings/${id}/cancel`, {
            method: 'PATCH'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadTodayBookings();
            await loadCalendar();
            await loadWeekPlan();
            await loadCancelledBookings();
            await showAlert('Booking cancelled successfully! The booking has been moved to cancelled bookings.', 'Cancelled', '✅');
        } else {
            await showAlert('Failed to cancel booking: ' + (result.details || result.error), 'Error', '❌');
        }
    } catch (error) {
        console.error('Cancel error:', error);
        await showAlert('Failed to cancel booking. Please try again.', 'Error', '❌');
    } finally {
        showLoading(false);
    }
}

// Complete booking
async function completeBooking(id) {
    const confirmed = await showConfirm('Mark this booking as completed? The car has been washed and the service is done.', 'Complete Booking', '✓');
    if (!confirmed) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_BASE}/bookings/${id}/complete`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadTodayBookings();
            await loadCalendar();
            await loadWeekPlan();
            await loadCompletedBookings();
            await showAlert('Booking completed successfully! The service has been marked as complete and moved to completed bookings.', 'Completed', '✅');
        } else {
            await showAlert('Failed to complete booking: ' + (result.details || result.error), 'Error', '❌');
        }
    } catch (error) {
        console.error('Complete error:', error);
        await showAlert('Failed to complete booking. Please try again.', 'Error', '❌');
    } finally {
        showLoading(false);
    }
}

// Utility functions
function showValidationMessage(message, type) {
    const messageEl = document.getElementById('validationMessage');
    messageEl.innerHTML = message;
    messageEl.className = `validation-message ${type}`;
    messageEl.style.display = 'block';
}

function hideValidationMessage() {
    document.getElementById('validationMessage').style.display = 'none';
}

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function formatDateISO(date) {
    return date.toISOString().split('T')[0];
}

function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildAutoScheduleMessage(suggestion) {
    let message = `📅 Scheduled for ${formatDate(suggestion.booking_date)} at ${formatTime(suggestion.booking_time)}.`;
    message += `<br>🚗 ${suggestion.distanceFromLowell} miles from Lowell.`;

    if (suggestion.isAnchor) {
        message += '<br>⚓ This will be the anchor booking for the day.';
    } else if (suggestion.distanceFromAnchor) {
        message += `<br>📏 ${suggestion.distanceFromAnchor} miles from anchor route (${suggestion.anchorAddress}).`;
    }

    message += '<br><strong>Click “Confirm Booking” to save this slot.</strong>';
    return message;
}
// Load completed bookings
async function loadCompletedBookings() {
    try {
        const response = await fetch(`${API_BASE}/completed-bookings`);
        const result = await response.json();
        
        if (result.success) {
            displayCompletedBookings(result.data);
        }
    } catch (error) {
        console.error('Failed to load completed bookings:', error);
    }
}

// Display completed bookings
function displayCompletedBookings(bookings) {
    const container = document.getElementById('completedBookings');
    
    if (!container) return; // If element doesn't exist yet
    
    if (bookings.length === 0) {
        container.innerHTML = '<div class="no-bookings">No completed bookings yet</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Group bookings by date
    const groupedByDate = {};
    bookings.forEach(booking => {
        if (!groupedByDate[booking.booking_date]) {
            groupedByDate[booking.booking_date] = [];
        }
        groupedByDate[booking.booking_date].push(booking);
    });
    
    // Display by date
    Object.keys(groupedByDate).sort().reverse().forEach(date => {
        const dateHeader = document.createElement('h4');
        dateHeader.textContent = formatDate(date);
        dateHeader.style.marginTop = '20px';
        dateHeader.style.marginBottom = '10px';
        container.appendChild(dateHeader);
        
        groupedByDate[date].forEach(booking => {
            const card = createCompletedBookingCard(booking);
            container.appendChild(card);
        });
    });
}

// Create completed booking card
function createCompletedBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card completed';
    
    card.innerHTML = `
        <div class="booking-header">
            <div class="booking-customer">✓ ${booking.customer_name}</div>
            <div class="booking-time">${formatTime(booking.booking_time)}</div>
        </div>
        <div class="booking-details">
            <div class="booking-detail">📍 ${booking.address}</div>
            <div class="booking-detail">🚗 ${booking.distance_from_lowell} miles from base</div>
            ${booking.service_type ? 
                `<div class="booking-detail">🧽 ${capitalizeFirst(booking.service_type)} Service</div>` : ''}
            <div class="booking-detail" style="color: green;">✓ Completed on ${new Date(booking.completed_at).toLocaleString()}</div>
        </div>
    `;
    
    return card;
}

// Load cancelled bookings
async function loadCancelledBookings() {
    try {
        const response = await fetch(`${API_BASE}/cancelled-bookings`);
        const result = await response.json();
        
        if (result.success) {
            displayCancelledBookings(result.data);
        }
    } catch (error) {
        console.error('Failed to load cancelled bookings:', error);
    }
}

// Display cancelled bookings
function displayCancelledBookings(bookings) {
    const container = document.getElementById('cancelledBookings');
    
    if (!container) return; // If element doesn't exist yet
    
    if (bookings.length === 0) {
        container.innerHTML = '<div class="no-bookings">No cancelled bookings</div>';
        return;
    }
    
    container.innerHTML = '';
    
    // Group bookings by date
    const groupedByDate = {};
    bookings.forEach(booking => {
        if (!groupedByDate[booking.booking_date]) {
            groupedByDate[booking.booking_date] = [];
        }
        groupedByDate[booking.booking_date].push(booking);
    });
    
    // Display by date
    Object.keys(groupedByDate).sort().reverse().forEach(date => {
        const dateHeader = document.createElement('h4');
        dateHeader.textContent = formatDate(date);
        dateHeader.style.marginTop = '20px';
        dateHeader.style.marginBottom = '10px';
        container.appendChild(dateHeader);
        
        groupedByDate[date].forEach(booking => {
            const card = createCancelledBookingCard(booking);
            container.appendChild(card);
        });
    });
}

// Create cancelled booking card
function createCancelledBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card cancelled';
    
    card.innerHTML = `
        <div class="booking-header">
            <div class="booking-customer">✕ ${booking.customer_name}</div>
            <div class="booking-time">${formatTime(booking.booking_time)}</div>
        </div>
        <div class="booking-details">
            <div class="booking-detail">📍 ${booking.address}</div>
            <div class="booking-detail">🚗 ${booking.distance_from_lowell} miles from base</div>
            ${booking.service_type ? 
                `<div class="booking-detail">🧽 ${capitalizeFirst(booking.service_type)} Service</div>` : ''}
            <div class="booking-detail" style="color: #f44336;">✕ Cancelled on ${new Date(booking.cancelled_at).toLocaleString()}</div>
        </div>
    `;
    
    return card;
}
// Weekly plan
async function loadWeekPlan() {
    try {
        const response = await fetch(`${API_BASE}/bookings/week`);
        const result = await response.json();

        if (result.success) {
            render30DaySchedule(result.data);
        } else {
            render30DaySchedule(null, result.error || 'Unable to load schedule');
        }
    } catch (error) {
        console.error('Failed to load schedule:', error);
        render30DaySchedule(null, 'Failed to load schedule');
    }
}

function render30DaySchedule(data, errorMessage) {
    const container = document.getElementById('weekPlan');
    container.innerHTML = '';

    if (errorMessage) {
        container.innerHTML = `<div class="no-bookings">${errorMessage}</div>`;
        return;
    }

    if (!data || !data.days || !data.days.length) {
        container.innerHTML = '<div class="no-bookings">No schedule data available.</div>';
        return;
    }

    data.days.forEach((day) => {
        const card = document.createElement('div');
        card.className = 'week-day-card';

        // Determine card class based on booking status
        if (!day.isWorkingDay && day.bookingCount === 0) {
            card.classList.add('off-day');
        } else if (day.isFull) {
            card.classList.add('full');
        } else if (day.bookingCount > 0) {
            card.classList.add('partial');
        } else {
            card.classList.add('available');
        }

        const status = !day.isWorkingDay && day.bookingCount === 0
            ? 'Day off'
            : day.bookingCount === 0
                ? 'Available'
                : `${day.bookingCount}/${day.capacity} bookings`;

        let bookingsList = '';
        if (day.bookingCount > 0) {
            bookingsList = '<div class="week-day-details" style="display: none;"><ul>' + day.bookings.map((booking, index) => {
                const anchorBadge = booking.is_anchor ? ' <span class="anchor-badge">⚓ Anchor</span>' : '';
                let travelInfo = '';
                
                // Show travel time/distance from previous booking
                if (index > 0 && booking.travel_from_previous) {
                    const travel = booking.travel_from_previous;
                    travelInfo = `<div class="travel-info">🚗 ${travel.distanceText} · ⏱️ ${travel.durationText} from previous</div>`;
                }
                
                // Add action buttons for each booking in week plan
                const actionButtons = `
                    <div class="week-booking-actions">
                        <button class="btn-mini btn-success" onclick="completeBooking(${booking.id})" title="Complete">✓</button>
                        <button class="btn-mini btn-warning" onclick="cancelBooking(${booking.id})" title="Cancel">✕</button>
                    </div>
                `;
                
                return `${travelInfo}<li class="booking-detail-item">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div style="flex: 1;">
                            <div class="booking-time">${formatTime(booking.booking_time)}</div>
                            <div class="booking-customer">${booking.customer_name}${anchorBadge}</div>
                            <div class="booking-address">${booking.address}</div>
                            ${booking.customer_phone ? `<div class="booking-phone">📞 ${booking.customer_phone}</div>` : ''}
                            ${booking.service_type ? `<div class="booking-service">🔧 ${booking.service_type}</div>` : ''}
                        </div>
                        ${actionButtons}
                    </div>
                </li>`;
            }).join('') + '</ul></div>';
        }

        const expandIcon = day.bookingCount > 0 ? '<span class="expand-icon">▼</span>' : '';
        
        card.innerHTML = `
            <div class="week-day-header" ${day.bookingCount > 0 ? 'style="cursor: pointer;"' : ''}>
                <div>
                    <div class="week-day-title">${day.label}</div>
                    <div class="week-day-status">${status}</div>
                    ${day.hasAnchor && day.anchorAddress ? `<div class="anchor-preview">⚓ Route starts at ${day.anchorAddress.split(',')[0]}</div>` : ''}
                </div>
                ${expandIcon}
            </div>
            ${bookingsList}
        `;

        // Add click handler to toggle details for ANY day with bookings
        if (day.bookingCount > 0) {
            const header = card.querySelector('.week-day-header');
            const details = card.querySelector('.week-day-details');
            const expandIcon = card.querySelector('.expand-icon');
            
            // Make header clickable even for off-days
            header.style.cursor = 'pointer';
            
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking on action buttons
                if (e.target.closest('.week-booking-actions')) return;
                
                const isExpanded = details.style.display !== 'none';
                details.style.display = isExpanded ? 'none' : 'block';
                expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
                card.classList.toggle('expanded', !isExpanded);
            });
        }

        container.appendChild(card);
    });
}
