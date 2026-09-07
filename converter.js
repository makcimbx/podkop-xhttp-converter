'use strict';
// XHTTP schema: shtorm-7/sing-box-extended, v1.13.18-extended-2.6.5
// and v1.14.0-extended-2.7.1, option/v2ray_transport.go.
(function (root) {
    const XMUX_PROFILE = Object.freeze({
        max_concurrency: '16-32', max_connections: 0, c_max_reuse_times: 0,
        h_max_request_times: '600-900', h_max_reusable_secs: '1800-3000', h_keep_alive_period: 0
    });
    const modes = ['auto', 'packet-up', 'stream-up', 'stream-one'];
    const fields = {
        host: ['host', 'string'], path: ['path', 'string'], mode: ['mode', 'mode'],
        headers: ['headers', 'headers'],
        xPaddingBytes: ['x_padding_bytes', 'positiveRange'],
        noGRPCHeader: ['no_grpc_header', 'boolean'], noSSEHeader: ['no_sse_header', 'boolean'],
        scMaxEachPostBytes: ['sc_max_each_post_bytes', 'positiveRange'],
        scMinPostsIntervalMs: ['sc_min_posts_interval_ms', 'range'],
        scMaxBufferedPosts: ['sc_max_buffered_posts', 'integer'],
        scStreamUpServerSecs: ['sc_stream_up_server_secs', 'range'],
        xPaddingObfsMode: ['x_padding_obfs_mode', 'boolean'],
        xPaddingKey: ['x_padding_key', 'string'], xPaddingHeader: ['x_padding_header', 'string'],
        xPaddingPlacement: ['x_padding_placement', ['cookie', 'header', 'query', 'queryInHeader']],
        xPaddingMethod: ['x_padding_method', ['repeat-x', 'tokenish']],
        uplinkHTTPMethod: ['uplink_http_method', 'method'],
        sessionPlacement: ['session_placement', ['path', 'cookie', 'header', 'query']],
        sessionKey: ['session_key', 'string'],
        seqPlacement: ['seq_placement', ['path', 'cookie', 'header', 'query']], seqKey: ['seq_key', 'string'],
        uplinkDataPlacement: ['uplink_data_placement', ['auto', 'body', 'cookie', 'header']],
        uplinkDataKey: ['uplink_data_key', 'string'], uplinkChunkSize: ['uplink_chunk_size', 'range'],
        sessionIDTable: ['session_id_table', 'string'], sessionIDLength: ['session_id_length', 'range']
    };
    const muxFields = {
        maxConcurrency: ['max_concurrency', 'range'], maxConnections: ['max_connections', 'range'],
        cMaxReuseTimes: ['c_max_reuse_times', 'range'], hMaxRequestTimes: ['h_max_request_times', 'range'],
        hMaxReusableSecs: ['h_max_reusable_secs', 'range'], hKeepAlivePeriod: ['h_keep_alive_period', 'signedInteger']
    };
    function fail(message) { throw new Error(message); }
    function object(value, name) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}: нужен JSON-объект.`);
    }
    function range(value, name, positive = false) {
        if (typeof value !== 'number' && typeof value !== 'string') fail(`${name}: нужно число или диапазон «16-32».`);
        if (!/^\d+(?:-\d+)?$/.test(String(value))) fail(`${name}: некорректный диапазон.`);
        const parts = String(value).split('-').map(Number);
        if (parts.some(n => !Number.isSafeInteger(n) || n > 2147483647 || n < (positive ? 1 : 0)) || parts[0] > parts.at(-1)) {
            fail(`${name}: диапазон должен быть возрастающим и в пределах ${positive ? 1 : 0}…2147483647.`);
        }
        return value;
    }
    function cast(value, kind, name) {
        if (Array.isArray(kind)) {
            if (typeof value !== 'string' || (value !== '' && !kind.includes(value))) fail(`${name}: неподдерживаемое значение.`);
            return value;
        }
        if (kind === 'range' || kind === 'positiveRange') return range(value, name, kind === 'positiveRange');
        if (kind === 'boolean') {
            if (typeof value !== 'boolean') fail(`${name}: нужно true или false, без кавычек.`);
        } else if (kind === 'integer' || kind === 'signedInteger') {
            if (!Number.isSafeInteger(value) || Math.abs(value) > 2147483647 || (kind === 'integer' && value < 0)) fail(`${name}: некорректное целое число.`);
        } else if (kind === 'headers') {
            object(value, name);
            for (const [key, v] of Object.entries(value)) {
                if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || typeof v !== 'string' || /[\r\n\0]/.test(v)) fail(`${name}: некорректный HTTP-заголовок.`);
                if (key.toLowerCase() === 'host') fail('headers.Host не поддерживается ядром: используйте отдельный параметр host.');
            }
        } else {
            if (typeof value !== 'string') fail(`${name}: нужна строка.`);
            if (/[\r\n\0]/.test(value)) fail(`${name}: недопустимые управляющие символы.`);
            if (kind === 'mode' && !modes.includes(value)) fail('Неподдерживаемый mode XHTTP.');
            if (kind === 'method' && value !== '' && !/^[A-Z]+$/.test(value)) fail('uplinkHTTPMethod: используйте HTTP-метод в верхнем регистре.');
        }
        return value;
    }
    function mapFields(source, mapping, prefix, warnings) {
        const result = {};
        for (const [key, value] of Object.entries(source)) {
            const spec = Object.hasOwn(mapping, key) ? mapping[key] : Object.values(mapping).find(s => s[0] === key);
            if (!spec) { warnings.push(`Не перенесён параметр ${prefix}${key}: отсутствует поддерживаемое соответствие. Проверьте исходную конфигурацию.`); continue; }
            const [name, kind] = spec;
            if (Object.hasOwn(result, name)) fail(`${prefix}${key}: одновременно заданы два варианта одного параметра.`);
            result[name] = cast(value, kind, `${prefix}${key}`);
        }
        return result;
    }
    function boolParam(value, name) {
        if (!['0', '1', 'true', 'false'].includes(value)) fail(`${name}: ожидается 0/1 или true/false.`);
        return value === '1' || value === 'true';
    }
    function convert(input, options = {}) {
        const warnings = [], changes = [];
        const profile = options.profile ?? 'exact';
        if (!['exact', 'podkop'].includes(profile)) fail('Неизвестный профиль.');
        const text = input.trim();
        if (!text.startsWith('vless://')) fail('Ссылка должна начинаться с vless://.');
        if (/\s/.test(text) || /%(?![\da-fA-F]{2})/.test(text)) fail('Некорректная ссылка: пробелы или повреждённое URL-кодирование.');
        // Validate encoded UTF-8 without decoding URL components a second time.
        try { decodeURIComponent(text); } catch { fail('Некорректное UTF-8 URL-кодирование.'); }
        let url;
        try { url = new URL(text); } catch { fail('Некорректный адрес или порт в VLESS-ссылке.'); }
        const p = url.searchParams;
        for (const key of new Set(p.keys())) if (p.getAll(key).length > 1) fail(`Параметр ${key} указан несколько раз.`);
        const uuid = decodeURIComponent(url.username);
        if (!/^[\da-fA-F]{8}(?:-[\da-fA-F]{4}){3}-[\da-fA-F]{12}$/.test(uuid)) fail('UUID должен быть в формате 8-4-4-4-12 шестнадцатеричных символов.');
        if (url.password || !url.hostname || (url.pathname && url.pathname !== '/')) fail('Некорректная структура VLESS-ссылки: проверьте адрес, UUID и параметр path.');
        if (!url.port || !/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535) fail('Укажите порт сервера от 1 до 65535 явно.');
        const type = p.get('type');
        if (type !== 'xhttp' && type !== 'splithttp') fail('Этот конвертер поддерживает только type=xhttp (или splithttp).');
        if (type === 'splithttp') changes.push('Название транспорта splithttp преобразовано в xhttp.');
        const security = p.get('security') ?? 'none';
        if (!['none', 'tls', 'reality'].includes(security)) fail('Поддерживаются security=none, tls и reality.');
        if (!p.has('security')) warnings.push('security отсутствует: по правилам VLESS TLS не включён. Проверьте, что это соответствует серверу.');
        if (p.has('encryption') && p.get('encryption') !== 'none') fail('VLESS Encryption не поддерживается этим конвертером; требуется encryption=none.');
        if (p.get('flow')) fail('Непустой flow (включая Vision) нельзя переносить в этот профиль XHTTP. Проверьте ссылку; поле не будет молча удалено.');
        let transport = {type: 'xhttp', path: p.has('path') ? cast(p.get('path'), 'string', 'path') : '/', mode: p.has('mode') ? cast(p.get('mode'), 'mode', 'mode') : 'auto'};
        if (p.has('host')) transport.host = cast(p.get('host'), 'string', 'host');
        if (p.has('x_padding_bytes')) transport.x_padding_bytes = range(p.get('x_padding_bytes'), 'x_padding_bytes', true);
        if (p.has('extra')) {
            let extra;
            try { extra = JSON.parse(p.get('extra')); } catch { fail('extra содержит некорректный JSON. Дополнительные параметры не отброшены: конвертация остановлена.'); }
            object(extra, 'extra');
            if (Object.hasOwn(extra, 'downloadSettings') || Object.hasOwn(extra, 'download')) fail('Раздельный downloadSettings/download пока не поддерживается: нужен ручной перевод в transport.download. Конвертация остановлена, чтобы не потерять настройки скачивания.');
            const {xmux, ...rest} = extra;
            const mapped = mapFields(rest, fields, 'extra.', warnings);
            for (const key of Object.keys(mapped)) if (Object.hasOwn(transport, key) && JSON.stringify(mapped[key]) !== JSON.stringify(transport[key])) changes.push(`extra переопределяет transport.${key}.`);
            transport = {...transport, ...mapped};
            if (Object.hasOwn(extra, 'xmux')) {
                object(xmux, 'extra.xmux');
                transport.xmux = mapFields(xmux, muxFields, 'extra.xmux.', warnings);
                if (!Object.keys(transport.xmux).length && Object.keys(xmux).length) fail('Ни один параметр extra.xmux не распознан; конвертация остановлена.');
            }
        }
        if (transport.x_padding_bytes === undefined) {
            transport.x_padding_bytes = '100-1000';
            changes.push('Добавлен x_padding_bytes=100-1000: проверяемые версии extended требуют явное положительное значение.');
        }
        const config = {
            type: 'vless', tag: url.hash ? decodeURIComponent(url.hash.slice(1)) : 'VLESS-XHTTP',
            server: url.hostname.replace(/^\[|\]$/g, ''), server_port: Number(url.port), uuid
        };
        if (security !== 'none') {
            const tls = {enabled: true};
            if (p.has('sni')) tls.server_name = cast(p.get('sni'), 'string', 'sni');
            if (p.has('alpn')) {
                tls.alpn = p.get('alpn').split(',');
                if (tls.alpn.some(s => !s || /[\s\0]/.test(s))) fail('alpn: нужен непустой список протоколов через запятую.');
            }
            if (security === 'reality') {
                if (!p.get('sni')) fail('Для REALITY укажите sni.');
                const pbk = p.get('pbk') || '';
                if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(pbk)) fail('pbk: нужен публичный ключ REALITY (32 байта в base64url без =).');
                const sid = p.get('sid') ?? '';
                if (!/^(?:[\da-fA-F]{2}){0,8}$/.test(sid)) fail('sid: чётное число hex-символов, не более 16.');
                tls.reality = {enabled: true, public_key: pbk, short_id: sid};
                tls.utls = {enabled: true, fingerprint: p.get('fp') || 'chrome'};
                if (!p.get('fp')) changes.push('Для REALITY добавлен uTLS fingerprint=chrome.');
            } else if (p.has('fp') && p.get('fp') !== 'none') {
                if (!p.get('fp')) fail('fp не должен быть пустым.');
                tls.utls = {enabled: true, fingerprint: p.get('fp')};
            }
            if (tls.utls) {
                const fps = ['chrome', 'firefox', 'edge', 'safari', '360', 'qq', 'ios', 'android', 'random', 'randomized'];
                if (!fps.includes(tls.utls.fingerprint)) fail('Этот uTLS fingerprint не поддерживается проверяемыми версиями ядра.');
            }
            if (p.has('allowInsecure') && p.has('insecure')) fail('Укажите только один из allowInsecure / insecure.');
            if (p.has('allowInsecure') || p.has('insecure')) {
                tls.insecure = boolParam(p.get('allowInsecure') ?? p.get('insecure'), 'allowInsecure');
                if (security === 'reality' && tls.insecure) fail('Для REALITY insecure=true не поддерживается этим конвертером.');
                if (tls.insecure) warnings.push('Проверка TLS-сертификата отключена исходной ссылкой (insecure=true). Это небезопасно.');
            }
            if (tls.alpn?.[0] === 'h3' && (tls.utls || tls.reality)) fail('HTTP/3 несовместим с REALITY/uTLS в этом профиле. Нельзя молча менять alpn или fingerprint.');
            config.tls = tls;
        } else if (['sni', 'alpn', 'pbk', 'sid', 'fp', 'allowInsecure', 'insecure'].some(k => p.has(k))) {
            warnings.push('security=none: TLS/REALITY-параметры из ссылки не применены.');
        }
        // Profile is explicit opt-in. Never overwrite an explicit mode or XMUX object.
        if (profile === 'podkop') {
            if (security === 'reality' && transport.mode === 'auto') {
                transport.mode = 'stream-one';
                changes.push('Профиль Podkop: REALITY mode=auto → stream-one. Сервер должен поддерживать stream-one; это не универсальная оптимизация.');
            }
            if (!Object.hasOwn(transport, 'xmux')) {
                transport.xmux = {...XMUX_PROFILE};
                changes.push('Профиль Podkop: добавлен XMUX 16-32 из примера extended, с лимитами переиспользования 600-900 / 1800-3000.');
            } else warnings.push('Профиль Podkop сохранил явный extra.xmux без изменений, включая нули и пустой объект.');
        }
        if (!Object.hasOwn(transport, 'xmux')) warnings.push('XMUX отсутствует: в проверяемых версиях extended max_concurrency по умолчанию равен 1. Для явного профиля 16-32 выберите режим Podkop.');
        if (transport.mode === 'auto') warnings.push('В проверяемых версиях extended auto не выбирает stream-one для REALITY, как Xray. При необходимости выберите профиль Podkop.');
        if (transport.xmux) {
            const upper = v => Number(String(v ?? 0).split('-').at(-1));
            if (upper(transport.xmux.max_connections) > 0 && upper(transport.xmux.max_concurrency) > 0) fail('XMUX: max_connections и max_concurrency не могут одновременно быть больше нуля.');
            if (!Object.keys(transport.xmux).length) warnings.push('Явный xmux={} сохранён: это НЕ то же самое, что отсутствие XMUX; лимиты ядра не будут автоматически подставлены.');
        }
        if (transport.mode !== 'packet-up' && (transport.uplink_http_method === 'GET' || ['cookie', 'header'].includes(transport.uplink_data_placement))) fail('uplinkHTTPMethod=GET и uplinkDataPlacement=cookie/header разрешены ядром только при mode=packet-up.');
        if (transport.mode === 'stream-one' && (!config.tls || config.tls.alpn?.[0] === 'http/1.1')) warnings.push('stream-one требует совместимого двунаправленного HTTP-транспорта; без TLS/h2 этот вариант может не работать.');
        const known = new Set(['type', 'security', 'encryption', 'flow', 'path', 'host', 'mode', 'extra', 'x_padding_bytes', 'sni', 'alpn', 'pbk', 'sid', 'fp', 'allowInsecure', 'insecure']);
        for (const key of p.keys()) if (!known.has(key)) warnings.push(`Не перенесён URL-параметр ${key}: проверьте его назначение до использования JSON.`);
        config.transport = transport;
        return {config, warnings, changes};
    }
    const api = {convert, XMUX_PROFILE};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.XHTTPConverter = api;
})(globalThis);
