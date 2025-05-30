// Configuración de Google Sheets API
const GOOGLE_SHEETS_CONFIG = {
    apiKey: 'AIzaSyB5RSXmO9GCgXs-e-0TxeLRYeM1emLwA28',
    spreadsheetId: '1QGTPBquKHQbO0sTO5pZr9w--mCWNNMjO1Mh9GC8q2eU',
    range: 'Hoja1!A:C'
};

// Configuración de TestMail API
const TESTMAIL_CONFIG = {
    API_KEY: 'e769cbfe-db59-4af7-97d3-74703239d385',
    BASE_URL: 'https://api.testmail.app/api/json'
};

// Configuración de filtros de streaming
const STREAMING_FILTERS = {
    netflix: ['netflix', 'nflx', 'netflix.com', 'nflix', 'netflixtv'],
    disney: ['disney+', 'disney plus', 'disneyplus', 'disney', 'disney.com'],
    amazon: ['prime video', 'primevideo', 'amazon prime', 'amazon', 'prime', 'amazon.com', 'amazonprime']
};

let currentService = null;
let currentAlias = null;
let currentPrincipalEmail = null;
let refreshInterval = null;
let currentMessages = [];
let showToastMessages = true;

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    showServiceSelection();
});

function initializeEventListeners() {
    document.getElementById('consultBtn').addEventListener('click', handleConsultClick);
    document.getElementById('userEmail').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleConsultClick();
    });
    document.getElementById('refreshMessages').addEventListener('click', refreshMessages);
    document.getElementById('autoRefresh').addEventListener('change', handleAutoRefreshChange);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('emailModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    const copyFullMessageBtn = document.getElementById('copyFullMessage');
    if (copyFullMessageBtn) {
        copyFullMessageBtn.addEventListener('click', copyFullMessage);
    }
    document.getElementById('copyPrincipalEmailBtn').addEventListener('click', copyPrincipalEmail);
}

function selectService(serviceKey) {
    currentService = serviceKey;
    const service = SERVICES_CONFIG[serviceKey];
    const iconElement = document.getElementById('selectedServiceIcon');
    iconElement.innerHTML = `<i class="${service.icon}"></i>`;
    iconElement.className = `service-icon-small ${service.iconClass}`;
    document.getElementById('selectedServiceName').textContent = service.name;
    document.getElementById('selectedServiceDesc').textContent = service.description;
    document.getElementById('serviceInstructions').textContent = service.instruction;
    showEmailInput();
}

function showServiceSelection() {
    document.getElementById('serviceSelection').classList.remove('hidden');
    document.getElementById('emailInput').classList.add('hidden');
    document.getElementById('messagesSection').classList.add('hidden');
    document.getElementById('inboxSection').classList.add('hidden');
}

function showEmailInput() {
    document.getElementById('serviceSelection').classList.add('hidden');
    document.getElementById('emailInput').classList.remove('hidden');
    document.getElementById('messagesSection').classList.add('hidden');
    document.getElementById('inboxSection').classList.add('hidden');
    document.getElementById('userEmail').value = '';
    document.getElementById('emailError').textContent = '';
    setTimeout(() => {
        document.getElementById('userEmail').focus();
    }, 300);
}

function showMessagesSection() {
    // Actualizar la información de la plataforma seleccionada en la sección de mensajes
    const service = SERVICES_CONFIG[currentService];
    const platformIconElement = document.getElementById('selectedPlatformIcon');
    const platformNameElement = document.getElementById('selectedPlatformName');
    
    if (service && platformIconElement && platformNameElement) {
        platformIconElement.innerHTML = `<i class="${service.icon}"></i>`;
        platformIconElement.className = `service-icon-small ${service.iconClass}`;
        platformNameElement.textContent = service.name;
    }
    
    document.getElementById('serviceSelection').classList.add('hidden');
    document.getElementById('emailInput').classList.add('hidden');
    document.getElementById('messagesSection').classList.remove('hidden');
    document.getElementById('inboxSection').classList.remove('hidden');
}

function backToServices() {
    currentService = null;
    currentPrincipalEmail = null;
    currentAlias = null;
    clearRefreshInterval();
    showServiceSelection();
}

function backToEmailInput() {
    currentPrincipalEmail = null;
    currentAlias = null;
    clearRefreshInterval();
    showEmailInput();
}

function goBack() {
    window.location.href = 'main.html';
}

async function handleConsultClick() {
    const email = document.getElementById('userEmail').value.trim();
    const errorElement = document.getElementById('emailError');
    if (!email) {
        errorElement.textContent = 'Por favor ingresa tu correo electrónico';
        return;
    }
    if (!isValidEmail(email)) {
        errorElement.textContent = 'Por favor ingresa un correo electrónico válido';
        return;
    }
    errorElement.textContent = '';
    try {
        showLoading(true);
        const alias = await findAliasInSheets(email, currentService);
        if (!alias) {
            showToast('No se encontró un alias asociado para este correo y servicio.', 'warning');
            return;
        }
        const aliasInfo = parseTestMailAlias(alias);
        if (!aliasInfo) {
            showToast('El formato del alias no es válido para TestMail.', 'error');
            return;
        }
        
        currentPrincipalEmail = email;
        currentAlias = alias;
        document.getElementById('principalEmailDisplay').textContent = currentPrincipalEmail;
        
        showToastMessages = true;
        await loadMessagesFromTestMail(aliasInfo.namespace, aliasInfo.tag, alias);
        showMessagesSection();
        setupAutoRefresh();
        showToast(`Conexión establecida para: ${currentPrincipalEmail}`, 'success');
    } catch (error) {
        console.error('Error al consultar:', error);
        handleApiError(error);
    } finally {
        showLoading(false);
    }
}

function parseTestMailAlias(alias) {
    const match = alias.match(/^([^.]+)\.([^@]+)@inbox\.testmail\.app$/);
    if (match) {
        return {
            namespace: match[1],
            tag: match[2],
            fullAlias: alias
        };
    }
    return null;
}

async function findAliasInSheets(email, service) {
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_CONFIG.spreadsheetId}/values/${GOOGLE_SHEETS_CONFIG.range}`;
    const params = new URLSearchParams({
        key: GOOGLE_SHEETS_CONFIG.apiKey,
        majorDimension: 'ROWS',
        valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const url = `${baseUrl}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se puede acceder a la base de datos');
    const data = await response.json();
    const rows = data.values || [];
    for (let i = 1; i < rows.length; i++) {
        const [platform, userEmail, alias] = rows[i];
        if (platform && userEmail && alias) {
            const platformNormalized = platform.toLowerCase().replace(/[^a-z]/g, '');
            let serviceNormalized = service.toLowerCase();
            if (service === 'amazon') serviceNormalized = 'primevideo';
            if (service === 'disney') serviceNormalized = 'disney';
            if (platformNormalized.includes(serviceNormalized) &&
                userEmail.toLowerCase().trim() === email.toLowerCase().trim()) {
                return alias;
            }
        }
    }
    return null;
}

async function loadMessagesFromTestMail(namespace, tag, fullAlias, showMessages = true) {
    const allMessages = await fetchMessagesFromTestMailAPI(namespace, tag, fullAlias);
    const filteredMessages = filterMessagesByService(allMessages, currentService);
    currentMessages = filteredMessages;
    renderEmails(filteredMessages);
    
    if (filteredMessages.length > 0) {
        const serviceName = SERVICES_CONFIG[currentService]?.name || currentService;
        updateStatus(`Activo - ${filteredMessages.length} correo(s) de ${serviceName}`, true);
        if (showMessages && showToastMessages) {
            showToast(`Se encontraron ${filteredMessages.length} mensaje(s) de ${serviceName}`, 'success');
        }
    } else {
        const serviceName = SERVICES_CONFIG[currentService]?.name || currentService;
        updateStatus(`Activo - Sin mensajes de ${serviceName}`, true);
        if (showMessages && showToastMessages) {
            showToast(`No se encontraron mensajes de ${serviceName}`, 'warning');
        }
    }
}

function filterMessagesByService(messages, service) {
    if (!service || !STREAMING_FILTERS[service]) {
        return messages;
    }
    const keywords = STREAMING_FILTERS[service];
    return messages.filter(message => {
        const subject = (message.subject || '').toLowerCase();
        const from = (message.from || '').toLowerCase();
        return keywords.some(keyword => subject.includes(keyword.toLowerCase()) || from.includes(keyword.toLowerCase()));
    });
}

async function fetchMessagesFromTestMailAPI(namespace, tag, fullAlias) {
    const url = `${TESTMAIL_CONFIG.BASE_URL}?apikey=${TESTMAIL_CONFIG.API_KEY}&namespace=${namespace}&tag=${tag}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) return [];
    const data = await response.json();
    const emails = Array.isArray(data) ? data : (data.emails || []);
    return emails.map((email, index) => ({
        id: email.id || `msg_${Date.now()}_${index}`,
        from: email.from || 'Remitente desconocido',
        to: email.to || currentPrincipalEmail,
        subject: email.subject || 'Sin asunto',
        timestamp: email.timestamp || Math.floor(Date.now() / 1000),
        html: email.html || '',
        text: email.text || '',
        isRead: false
    }));
}

function renderEmails(messages) {
    const emailList = document.getElementById('emailList');
    if (!messages || messages.length === 0) {
        const serviceName = SERVICES_CONFIG[currentService]?.name || 'este servicio';
        emailList.innerHTML = `
            <div class="no-emails">
                <i class="fas fa-inbox"></i>
                <p>No hay correos de ${serviceName} recibidos aún</p>
                <small>Los nuevos mensajes aparecerán aquí automáticamente</small>
            </div>
        `;
        return;
    }
    emailList.innerHTML = messages.map(email => `
        <div class="email-item" onclick="openEmailModal('${email.id}')">
            <div class="email-header">
                <div class="email-subject">${escapeHtml(email.subject || 'Sin asunto')}</div>
                <div class="email-date">${formatDate(email.timestamp)}</div>
            </div>
            <div class="email-from">De: ${escapeHtml(email.from || 'Desconocido')}</div>
            <div class="email-preview">${getEmailPreview(email)}</div>
        </div>
    `).join('');
}

function openEmailModal(messageId) {
    const message = currentMessages?.find(m => m.id === messageId);
    if (!message) return;
    window.currentModalMessage = message;
    document.getElementById('modalSubject').textContent = message.subject || 'Sin asunto';
    document.getElementById('modalFrom').textContent = message.from || 'Desconocido';
    document.getElementById('modalTo').textContent = currentPrincipalEmail || message.to;
    document.getElementById('modalDate').textContent = formatDate(message.timestamp, true);
    const contentDiv = document.getElementById('modalContent');
    if (message.html) {
        const iframe = document.createElement('iframe');
        iframe.srcdoc = message.html;
        iframe.style.width = '100%';
        iframe.style.minHeight = '400px';
        iframe.style.border = '1px solid var(--gray-200)';
        iframe.style.borderRadius = 'var(--radius)';
        contentDiv.innerHTML = '';
        contentDiv.appendChild(iframe);
    } else if (message.text) {
        contentDiv.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(message.text)}</pre>`;
    } else {
        contentDiv.innerHTML = '<p style="color: var(--gray-500); font-style: italic;">Este email no tiene contenido.</p>';
    }
    document.getElementById('emailModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    message.isRead = true;
    renderEmails(currentMessages);
}

function closeModal() {
    document.getElementById('emailModal').classList.add('hidden');
    document.body.style.overflow = '';
}

function getEmailPreview(email) {
    let preview = '';
    if (email.text) {
        preview = email.text.replace(/\s+/g, ' ').trim();
    } else if (email.html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = email.html;
        preview = tempDiv.textContent || tempDiv.innerText || '';
        preview = preview.replace(/\s+/g, ' ').trim();
    }
    if (preview.length > 120) {
        preview = preview.substring(0, 120) + '...';
    }
    return escapeHtml(preview) || '<em>Sin contenido de vista previa</em>';
}

async function copyPrincipalEmail() {
    if (!currentPrincipalEmail) return;
    try {
        await navigator.clipboard.writeText(currentPrincipalEmail);
        showToast('Correo principal copiado al portapapeles', 'success');
        const btn = document.getElementById('copyPrincipalEmailBtn');
        btn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            btn.style.transform = '';
        }, 150);
    } catch (error) {
        showToast('Error al copiar el correo', 'error');
    }
}

function copyFullMessage() {
    if (!window.currentModalMessage) return;
    const message = window.currentModalMessage;
    const fullText = `
Asunto: ${message.subject}
De: ${message.from}
Para: ${currentPrincipalEmail || message.to}
Fecha: ${formatDate(message.timestamp, true)}

${getTextFromHtml(message.html || message.text)}
    `.trim();
    navigator.clipboard.writeText(fullText).then(() => {
        showToast('Mensaje completo copiado al portapapeles', 'success');
    }).catch(() => {
        showToast('Error al copiar el mensaje', 'error');
    });
}

async function refreshMessages() {
    if (!currentAlias || !currentPrincipalEmail) return;
    try {
        const refreshBtn = document.getElementById('refreshMessages');
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        refreshBtn.disabled = true;
        const aliasInfo = parseTestMailAlias(currentAlias);
        if (aliasInfo) {
            showToastMessages = true;
            await loadMessagesFromTestMail(aliasInfo.namespace, aliasInfo.tag, currentAlias, true);
            showToast('Mensajes actualizados', 'success');
        } else {
            showToast('Error: formato de alias inválido', 'error');
        }
    } catch (error) {
        showToast('Error al actualizar mensajes: ' + error.message, 'error');
    } finally {
        const refreshBtn = document.getElementById('refreshMessages');
        refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Actualizar';
        refreshBtn.disabled = false;
    }
}

function handleAutoRefreshChange() {
    const interval = parseInt(document.getElementById('autoRefresh').value);
    clearRefreshInterval();
    if (interval > 0) {
        refreshInterval = setInterval(autoRefreshMessages, interval);
        showToast(`Auto-actualización configurada cada ${interval/1000} segundos`, 'success');
    }
}

async function autoRefreshMessages() {
    if (!currentAlias || !currentPrincipalEmail) return;
    try {
        const aliasInfo = parseTestMailAlias(currentAlias);
        if (aliasInfo) {
            showToastMessages = false;
            await loadMessagesFromTestMail(aliasInfo.namespace, aliasInfo.tag, currentAlias, false);
        }
    } catch (error) {
        console.error('Error en auto-refresh:', error);
    }
}

function setupAutoRefresh() {
    const interval = parseInt(document.getElementById('autoRefresh').value);
    if (interval > 0) {
        refreshInterval = setInterval(autoRefreshMessages, interval);
    }
}

function clearRefreshInterval() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function updateStatus(text, isActive) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    if (statusText) statusText.textContent = text;
    if (statusDot) {
        if (isActive) {
            statusDot.classList.add('active');
        } else {
            statusDot.classList.remove('active');
        }
    }
}

function formatDate(timestamp, detailed = false) {
    if (!timestamp) return 'Fecha desconocida';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (detailed) {
        return date.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    if (diffDays === 0) {
        return date.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } else if (diffDays === 1) {
        return 'Ayer';
    } else if (diffDays < 7) {
        return `Hace ${diffDays} días`;
    } else {
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short'
        });
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTextFromHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fas fa-check-circle' : 
                 type === 'error' ? 'fas fa-exclamation-circle' : 
                 'fas fa-exclamation-triangle';
    toast.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 4000);
}

function handleApiError(error) {
    let userMessage = 'Error al consultar los datos. ';
    if (error.message.includes('403') || error.message.includes('permisos')) {
        userMessage += 'Problema de permisos con Google Sheets. Verifica la API Key y que la hoja sea pública.';
    } else if (error.message.includes('404')) {
        userMessage += 'No se encontró la hoja de cálculo. Verifica el ID del documento.';
    } else if (error.message.includes('400')) {
        userMessage += 'Error en la configuración. Verifica el rango de celdas.';
    } else if (error.message.includes('TestMail')) {
        userMessage += 'Error con el servicio de correo temporal.';
    } else if (error.message.includes('fetch')) {
        userMessage += 'Problemas de conexión de red.';
    } else {
        userMessage += 'Error desconocido: ' + error.message;
    }
    showToast(userMessage, 'error');
}

// Configuración de servicios
const SERVICES_CONFIG = {
    netflix: {
        name: 'Netflix',
        icon: 'fa-solid fa-n',
        iconClass: 'netflix',
        description: 'Mensajes de verificación y notificaciones de Netflix',
        instruction: 'Ingresa tu correo principal de Netflix para ver todos los mensajes de verificación y notificaciones'
    },
    disney: {
        name: 'Disney+',
        icon: 'fa-solid fa-tv',
        iconClass: 'disney',
        description: 'Mensajes de acceso y comunicaciones de Disney+',
        instruction: 'Ingresa tu correo principal de Disney+ para ver todos los mensajes de acceso y comunicaciones'
    },
    amazon: {
        name: 'Prime Video',
        icon: 'fab fa-amazon',
        iconClass: 'amazon',
        description: 'Mensajes de Prime Video y verificaciones de Amazon',
        instruction: 'Ingresa tu correo principal de Amazon para ver todos los mensajes de Prime Video y verificaciones'
    }
};