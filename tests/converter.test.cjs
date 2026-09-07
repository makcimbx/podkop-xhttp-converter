'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {convert, XMUX_PROFILE} = require('../converter.js');
const {link, reality, fullExtra, engineCases} = require('./fixtures.cjs');

test('none does not enable TLS', () => assert.equal(convert(link({security:'none'})).config.tls, undefined));
test('TLS preserves SNI, ALPN and explicit insecure false', () => {
    const t = convert(link({alpn:'h2,http/1.1', allowInsecure:'false'})).config.tls;
    assert.deepEqual(t, {enabled:true,server_name:'example.com',alpn:['h2','http/1.1'],insecure:false});
});
test('insecure true is explicit and warned', () => {
    const r = convert(link({allowInsecure:'true'}));
    assert.equal(r.config.tls.insecure,true); assert.ok(r.warnings.some(s=>s.includes('небезопасно')));
});
test('missing ALPN and host remain absent, using core defaults', () => {
    const c = convert(link()).config; assert.equal(c.tls.alpn,undefined); assert.equal(c.transport.host,undefined);
});
test('exact preserves auto and leaves missing XMUX absent with warnings', () => {
    const r=convert(link(reality)); assert.equal(r.config.transport.mode,'auto'); assert.equal(r.config.transport.xmux,undefined);
    assert.ok(r.warnings.some(s=>s.includes('max_concurrency'))); assert.ok(r.warnings.some(s=>s.includes('auto')));
});
test('Podkop REALITY fills full XMUX and changes auto visibly', () => {
    const r=convert(link(reality),{profile:'podkop'}); assert.deepEqual(r.config.transport.xmux,XMUX_PROFILE);
    assert.equal(r.config.transport.mode,'stream-one'); assert.ok(r.changes.some(s=>s.includes('auto → stream-one')));
});
test('Podkop does not change TLS auto or explicit packet-up', () => {
    assert.equal(convert(link(),{profile:'podkop'}).config.transport.mode,'auto');
    assert.equal(convert(link({...reality,mode:'packet-up'}),{profile:'podkop'}).config.transport.mode,'packet-up');
});
test('explicit XMUX wins over profile, including zeros', () => {
    const r=convert(link(reality,{xmux:{maxConcurrency:0,maxConnections:'2-4',hKeepAlivePeriod:0}}),{profile:'podkop'});
    assert.deepEqual(r.config.transport.xmux,{max_concurrency:0,max_connections:'2-4',h_keep_alive_period:0});
});
test('empty XMUX is not replaced by defaults', () => {
    const r=convert(link({}, {xmux:{}}),{profile:'podkop'}); assert.deepEqual(r.config.transport.xmux,{});
    assert.ok(r.warnings.some(s=>s.includes('xmux={}')));
});
test('literal percent in extra is not decoded twice (upstream regression)', () => {
    const r=convert(link({}, {seqKey:'literal%value',xmux:{maxConcurrency:'16-32'}}));
    assert.equal(r.config.transport.seq_key,'literal%value'); assert.equal(r.config.transport.xmux.max_concurrency,'16-32');
});
test('encoded percent sequences and plus survive exactly once', () => {
    const c=convert(link({path:'/a%2Fb+%done'}, {headers:{'X-Test':'%2F+100%'}})).config;
    assert.equal(c.transport.path,'/a%2Fb+%done'); assert.equal(c.transport.headers['X-Test'],'%2F+100%');
});
test('full extra mapping preserves range types, booleans, headers and session fields', () => {
    const t=convert(link({mode:'packet-up'},fullExtra)).config.transport;
    assert.equal(t.sc_max_each_post_bytes,'1000000-2000000'); assert.equal(t.no_sse_header,false);
    assert.equal(t.x_padding_obfs_mode,true); assert.equal(t.session_id_length,'16-32');
    assert.equal(t.x_padding_header,'X-Padding'); assert.equal(t.session_key,'X-Session');
    assert.equal(t.uplink_chunk_size,'2048-4096'); assert.equal(t.xmux.c_max_reuse_times,'10-20');
    assert.equal(t.xmux.h_keep_alive_period,-1);
});
test('snake-case extra and XMUX supported', () => {
    const t=convert(link({}, {no_grpc_header:false,xmux:{max_concurrency:16}})).config.transport;
    assert.equal(t.no_grpc_header,false); assert.equal(t.xmux.max_concurrency,16);
});
test('unknown fields are reported, not inserted in JSON', () => {
    const r=convert(link({mystery:'secret'}, {unknown:'secret'}));
    assert.equal(r.config.transport.unknown,undefined);
    assert.ok(r.warnings.some(s=>s.includes('extra.unknown'))); assert.ok(r.warnings.some(s=>s.includes('mystery')));
    assert.ok(r.warnings.every(s=>!s.includes('secret')));
});
test('extra precedence is visible', () => {
    const r=convert(link({path:'/url'}, {path:'/extra',mode:'stream-up'}));
    assert.equal(r.config.transport.path,'/extra'); assert.ok(r.changes.some(s=>s.includes('transport.path')));
});
test('IPv6 bracket syntax is converted to core server address', () => assert.equal(convert(link({},undefined,'[2001:db8::1]')).config.server,'2001:db8::1'));
test('splithttp alias gets canonical XHTTP', () => assert.equal(convert(link({type:'splithttp'})).config.transport.type,'xhttp'));
test('malicious tag is plain data', () => {
    const tag='<img src=x onerror=alert(1)>';
    assert.equal(convert(link().replace('#Test','#'+encodeURIComponent(tag))).config.tag,tag);
});
const invalid = [
    ['wrong scheme', 'https://example.com'],
    ['invalid UUID', link().replace('00000000-0000-4000-8000-000000000001','uuid')],
    ['missing port', link().replace(':443','')],
    ['zero port', link().replace(':443',':0')],
    ['bad port', link().replace(':443',':99999')],
    ['wrong transport', link({type:'grpc'})],
    ['bad security', link({security:'weird'})],
    ['Vision flow', link({flow:'xtls-rprx-vision'})],
    ['VLESS encryption', link({encryption:'mlkem768'})],
    ['invalid extra JSON', link({},'{oops')],
    ['empty extra', link({},'')],
    ['array extra', link({},[])],
    ['null extra', link({},'null')],
    ['null xmux', link({},{xmux:null})],
    ['array xmux', link({},{xmux:[]})],
    ['unrecognized xmux', link({},{xmux:{oops:16}})],
    ['double encoded extra', link({},encodeURIComponent('{"xmux":{}}'))],
    ['download settings', link({},{downloadSettings:{address:'example.com'}})],
    ['ambiguous aliases', link({},{xPaddingBytes:100,x_padding_bytes:200})],
    ['inverted range', link({},{xmux:{maxConcurrency:'32-16'}})],
    ['negative range', link({},{xmux:{maxConcurrency:-1}})],
    ['huge range', link({},{xmux:{maxConcurrency:'1-9999999999999'}})],
    ['range object', link({},{xmux:{maxConcurrency:{from:1,to:2}}})],
    ['two positive XMUX caps', link({},{xmux:{maxConcurrency:16,maxConnections:2}})],
    ['padding disabled', link({},{xPaddingBytes:0})],
    ['string boolean', link({},{noGRPCHeader:'false'})],
    ['bad mode', link({mode:'<img>'})],
    ['header host', link({},{headers:{Host:'example.com'}})],
    ['header newline', link({},{headers:{'X-Test':'a\r\nb'}})],
    ['bad placement', link({},{sessionPlacement:'body'})],
    ['GET in stream-one', link({mode:'stream-one'},{uplinkHTTPMethod:'GET'})],
    ['missing REALITY key', link({security:'reality'})],
    ['bad REALITY key', link({...reality,pbk:'bad'})],
    ['bad REALITY short ID', link({...reality,sid:'abc'})],
    ['unsupported fingerprint', link({...reality,fp:'madeup'})],
    ['REALITY HTTP3', link({...reality,alpn:'h3'})],
    ['uTLS HTTP3', link({fp:'chrome',alpn:'h3'})],
    ['empty ALPN', link({alpn:''})],
    ['invalid boolean URL', link({allowInsecure:'yes'})],
    ['bad encoding', link()+'&x=%GG'],
    ['bad encoded UTF8', link({path:'ok'}).replace('path=ok','path=%FF')],
    ['duplicate param', link().replace('#Test','&mode=auto&mode=packet-up')]
];
for (const [name,url] of invalid) test('reject: '+name,()=>assert.throws(()=>convert(url)));
for (const item of engineCases) test('fixture converts: '+item.name,()=>assert.ok(convert(item.url,{profile:item.profile}).config.transport));
