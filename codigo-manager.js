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

let currentService = null;
let currentAlias = null;
let refreshInterval = null;
let currentMessages = [];

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    showServiceSelection();
    addDebugButton();
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
    document.getElementById('copyFullMessage').addEventListener('click', copyFullMessage);
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
}

function showEmailInput() {
    document.getElementById('serviceSelection').classList.add('hidden');
    document.getElementById('emailInput').classList.remove('hidden');
    document.getElementById('messagesSection').classList.add('hidden');
    document.getElementById('userEmail').value = '';
    document.getElementById('emailError').textContent = '';
    setTimeout(() => {
        document.getElementById('userEmail').focus();
    }, 300);
}

function showMessagesSection() {
    document.getElementById('serviceSelection').classList.add('hidden');
    document.getElementById('emailInput').classList.add('hidden');
    document.getElementById('messagesSection').classList.remove('hidden');
}

function backToServices() {
    currentService = null;
    clearRefreshInterval();
    showServiceSelection();
}

function backToEmailInput() {
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
        currentAlias = alias;
        document.getElementById('aliasDisplay').textContent = alias;
        await loadMessagesFromTestMail(aliasInfo.namespace, aliasInfo.tag, alias);
        showMessagesSection();
        setupAutoRefresh();
        showToast(`Alias encontrado: ${alias}`, 'success');
    } catch (error) {
        console.error('Error al consultar:', error);
        handleApiError(error);
    } finally {
        showLoading(false);
    }
}

function parseTestMailAlias(alias) {
    // Ejemplo: wjlcs.netflixhns@inbox.testmail.app
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

async function loadMessagesFromTestMail(namespace, tag, fullAlias) {
    const messages = await fetchMessagesFromTestMailAPI(namespace, tag, fullAlias);
    currentMessages = messages;
    displayMessages(messages);
    if (messages.length > 0) {
        showToast(`Se encontraron ${messages.length} mensaje(s)`, 'success');
    } else {
        showToast('No se encontraron mensajes para este alias', 'warning');
    }
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
        to: email.to || fullAlias,
        subject: email.subject || 'Sin asunto',
        date: email.timestamp ? new Date(email.timestamp * 1000).toISOString() : (email.date ? new Date(email.date).toISOString() : new Date().toISOString()),
        content: email.html || (email.text ? `<pre>${escapeHtml(email.text)}</pre>` : ''),
        isRead: false
    }));
}

function displayMessages(messages) {
    const messagesList = document.getElementById('messagesList');
    if (!messages || messages.length === 0) {
        messagesList.innerHTML = `
            <div class="no-emails">
                <i class="fas fa-inbox"></i>
                <p>No hay mensajes disponibles</p>
                <small>Los mensajes aparecerán aquí cuando lleguen al alias: ${currentAlias || ''}</small>
            </div>
        `;
        return;
    }
    messagesList.innerHTML = messages.map(message => `
        <div class="email-item ${!message.isRead ? 'unread' : ''}" onclick="openEmailModal('${message.id}')">
            <div class="email-header">
                <div class="email-subject">${escapeHtml(message.subject)}</div>
                <div class="email-date">${formatDate(message.date)}</div>
            </div>
            <div class="email-from">De: ${escapeHtml(message.from)}</div>
            <div class="email-preview">${getTextPreview(message.content)}</div>
        </div>
    `).join('');
}

function openEmailModal(messageId) {
    const message = currentMessages?.find(m => m.id === messageId);
    if (!message) return;
    document.getElementById('modalSubject').textContent = message.subject;
    document.getElementById('modalFrom').textContent = message.from;
    document.getElementById('modalTo').textContent = message.to;
    document.getElementById('modalDate').textContent = formatDate(message.date);
    document.getElementById('modalContent').innerHTML = message.content;
    window.currentModalMessage = message;
    document.getElementById('emailModal').classList.remove('hidden');
    message.isRead = true;
    displayMessages(currentMessages);
}

function closeModal() {
    document.getElementById('emailModal').classList.add('hidden');
}

function copyFullMessage() {
    if (!window.currentModalMessage) return;
    const message = window.currentModalMessage;
    const fullText = `
Asunto: ${message.subject}
De: ${message.from}
Para: ${message.to}
Fecha: ${formatDate(message.date)}

${getTextFromHtml(message.content)}
    `.trim();
    navigator.clipboard.writeText(fullText).then(() => {
        showToast('Mensaje completo copiado al portapapeles', 'success');
    }).catch(() => {
        showToast('Error al copiar el mensaje', 'error');
    });
}

async function refreshMessages() {
    if (!currentAlias) return;
    try {
        const refreshBtn = document.getElementById('refreshMessages');
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        refreshBtn.disabled = true;
        const aliasInfo = parseTestMailAlias(currentAlias);
        if (aliasInfo) {
            await loadMessagesFromTestMail(aliasInfo.namespace, aliasInfo.tag, currentAlias);
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
        refreshInterval = setInterval(refreshMessages, interval);
        showToast(`Auto-actualización configurada cada ${interval/1000} segundos`, 'success');
    }
}

function setupAutoRefresh() {
    const interval = parseInt(document.getElementById('autoRefresh').value);
    if (interval > 0) {
        refreshInterval = setInterval(refreshMessages, interval);
    }
}

function clearRefreshInterval() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTextPreview(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    return text.substring(0, 150) + (text.length > 150 ? '...' : '');
}

function getTextFromHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    if (diffInMinutes < 1) return 'Ahora';
    if (diffInMinutes < 60) return `Hace ${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `Hace ${Math.floor(diffInMinutes/60)}h`;
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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
    setTimeout(() => { toast.remove(); }, 6000);
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

function addDebugButton() {
    const debugContainer = document.createElement('div');
    debugContainer.style.position = 'fixed';
    debugContainer.style.top = '10px';
    debugContainer.style.right = '10px';
    debugContainer.style.zIndex = '9999';
    debugContainer.style.display = 'flex';
    debugContainer.style.flexDirection = 'column';
    debugContainer.style.gap = '5px';
    const testmailButton = document.createElement('button');
    testmailButton.textContent = '📧 TestMail';
    testmailButton.style.padding = '6px 10px';
    testmailButton.style.backgroundColor = '#28a745';
    testmailButton.style.color = 'white';
    testmailButton.style.border = 'none';
    testmailButton.style.borderRadius = '4px';
    testmailButton.style.cursor = 'pointer';
    testmailButton.style.fontSize = '11px';
    testmailButton.onclick = async () => {
        showLoading(true);
        const testAlias = 'wjlcs.netflixhns@inbox.testmail.app';
        const aliasInfo = parseTestMailAlias(testAlias);
        if (aliasInfo) {
            await loadMessagesFromTestMail(aliasInfo.namespace, aliasInfo.tag, testAlias);
            showToast('Prueba de TestMail ejecutada.', 'success');
        }
        showLoading(false);
    };
    debugContainer.appendChild(testmailButton);
    document.body.appendChild(debugContainer);
}

// Agrega tu SERVICES_CONFIG aquí, igual que antes (por brevedad, lo puedes copiar del código anterior)
const SERVICES_CONFIG = {
    netflix: {
        name: 'Netflix',
        icon: 'fab fa-netflix',
        iconClass: 'netflix',
        description: 'Mensajes de verificación y notificaciones de Netflix',
        instruction: 'Ingresa tu correo principal de Netflix para ver todos los mensajes de verificación y notificaciones'
    },
    disney: {
        name: 'Disney+',
        icon: 'fas fa-play',
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
}
function formatEmailContent(email) {
    // Si el correo tiene HTML, lo mostramos centrado y estilizado.
    if (email.html) {
        return `
            <div class="email-content-centered">
                ${email.html}
            </div>
        `;
    }
    // Si solo hay texto plano, también lo centramos.
    if (email.text) {
        return `
            <div class="email-content-centered email-content-plain">
                ${autoLink(escapeHtml(email.text))}
            </div>
        `;
    }
    return `
        <div class="email-content-centered email-content-empty">
            <em>No hay contenido disponible para este mensaje.</em>
        </div>
    `;
};