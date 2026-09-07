'use strict';
(() => {
    const $ = id => document.getElementById(id);
    let output = '';
    let toastTimer;
    function notice(message) {
        clearTimeout(toastTimer);
        $('toast').textContent = message;
        $('toast').classList.add('show');
        toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500);
    }
    function invalidate() {
        clearTimeout(toastTimer);
        $('toast').classList.remove('show');
        $('toast').textContent = '';
        output = '';
        $('copyBtn').disabled = $('downloadBtn').disabled = true;
        $('jsonOutput').textContent = 'JSON конфигурация появится здесь...';
        $('jsonOutput').classList.remove('error-text');
        $('statsBar').replaceChildren();
        $('statsBar').classList.remove('visible');
        $('notices').hidden = true;
        $('warnings').replaceChildren();
        $('changes').replaceChildren();
    }
    function list(id, messages) {
        $(id).replaceChildren(...messages.map(message => {
            const item = document.createElement('li');
            item.textContent = message;
            return item;
        }));
        $(id + 'Title').hidden = !messages.length;
    }
    function convert() {
        invalidate();
        try {
            const result = XHTTPConverter.convert($('urlInput').value, {profile: $('profile').value});
            output = JSON.stringify(result.config, null, 2);
            // No user-controlled HTML: names, keys, errors and JSON are text nodes.
            $('jsonOutput').textContent = output;
            list('warnings', result.warnings);
            list('changes', result.changes);
            $('notices').hidden = !result.warnings.length && !result.changes.length;
            const c = result.config;
            for (const value of [c.tls?.reality ? 'REALITY' : c.tls ? 'TLS' : 'Без TLS', 'XHTTP', c.transport.mode, `Port ${c.server_port}`]) {
                const chip = document.createElement('span');
                chip.className = 'stat-chip';
                chip.textContent = value;
                $('statsBar').append(chip);
            }
            $('statsBar').classList.add('visible');
            $('copyBtn').disabled = $('downloadBtn').disabled = false;
        } catch (error) {
            $('jsonOutput').textContent = error.message;
            $('jsonOutput').classList.add('error-text');
            $('jsonOutput').focus();
        }
    }
    $('convertBtn').addEventListener('click', convert);
    $('urlInput').addEventListener('input', invalidate);
    $('profile').addEventListener('change', invalidate);
    $('urlInput').addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            convert();
        }
    });
    $('copyBtn').addEventListener('click', async () => {
        if (!output) return;
        try {
            await navigator.clipboard.writeText(output);
            notice('Скопировано в буфер обмена');
        } catch {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents($('jsonOutput'));
            selection.removeAllRanges();
            selection.addRange(range);
            notice('Буфер недоступен: JSON выделен. Скопируйте вручную или скачайте файл.');
        }
    });
    $('downloadBtn').addEventListener('click', () => {
        if (!output) return;
        const url = URL.createObjectURL(new Blob([output + '\n'], {type: 'application/json'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'podkop-outbound.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $('clearBtn').addEventListener('click', () => {
        $('urlInput').value = '';
        invalidate();
        $('urlInput').focus();
    });
})();
