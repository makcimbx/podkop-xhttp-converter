'use strict';
// Synthetic documentation addresses and a public test key; never real subscriptions.
const UUID = '00000000-0000-4000-8000-000000000001';
const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
function link(params = {}, extra, host = '192.0.2.1') {
    const query = new URLSearchParams({type: 'xhttp', security: 'tls', sni: 'example.com', ...params});
    if (extra !== undefined) query.set('extra', typeof extra === 'string' ? extra : JSON.stringify(extra));
    return `vless://${UUID}@${host}:443?${query}#Test`;
}
const reality = {security: 'reality', pbk: KEY, sid: 'abcd', fp: 'firefox'};
const fullExtra = {
    xPaddingBytes: '100-1000', noGRPCHeader: true, noSSEHeader: false,
    scMaxEachPostBytes: '1000000-2000000', scMinPostsIntervalMs: '10-30',
    scMaxBufferedPosts: 30, scStreamUpServerSecs: '20-80',
    xPaddingObfsMode: true, xPaddingKey: 'pad', xPaddingHeader: 'X-Padding',
    xPaddingPlacement: 'queryInHeader', xPaddingMethod: 'tokenish',
    uplinkHTTPMethod: 'POST', sessionPlacement: 'header', sessionKey: 'X-Session',
    seqPlacement: 'header', seqKey: 'X-Seq', uplinkDataPlacement: 'body',
    uplinkDataKey: 'X-Data', uplinkChunkSize: '2048-4096',
    sessionIDTable: '0123456789abcdef', sessionIDLength: '16-32',
    headers: {'X-Test': 'literal%value'},
    xmux: {maxConcurrency: '16-32', maxConnections: 0, cMaxReuseTimes: '10-20',
        hMaxRequestTimes: '600-900', hMaxReusableSecs: '1800-3000', hKeepAlivePeriod: -1}
};
const engineCases = [
    {name: 'tls-exact', url: link()},
    {name: 'reality-exact', url: link(reality)},
    {name: 'reality-profile', url: link(reality), profile: 'podkop'},
    {name: 'tls-profile', url: link(), profile: 'podkop'},
    {name: 'plaintext', url: link({security: 'none'})},
    {name: 'tls-insecure', url: link({allowInsecure: 'true'})},
    {name: 'ipv6', url: link({}, undefined, '[2001:db8::1]')},
    {name: 'extra-fields', url: link({mode: 'packet-up'}, fullExtra)},
    {name: 'empty-mux', url: link({}, {xmux: {}})},
    {name: 'range-connections', url: link({}, {xmux: {maxConcurrency: 0, maxConnections: '2-4', cMaxReuseTimes: '10-20'}})},
    {name: 'tls-h3', url: link({alpn: 'h3'})},
    {name: 'stream-up', url: link({mode: 'stream-up'})}
];
module.exports = {UUID, KEY, link, reality, fullExtra, engineCases};
