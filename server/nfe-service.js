const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { SignedXml } = require('xml-crypto');
const { create } = require('xmlbuilder2');

// A NFe exige datas no formato TDateTimeUTC: "AAAA-MM-DDThh:mm:ssTZD" (offset numérico, sem
// milissegundos, sem "Z" literal). Date.prototype.toISOString() produz "...ss.mmmZ", que a SEFAZ
// rejeita na validação de schema. O Brasil não usa mais horário de verão desde 2019, então o
// horário de Brasília é sempre UTC-03:00.
function formatSefazDateTime(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const y = local.getUTCFullYear();
    const mo = pad(local.getUTCMonth() + 1);
    const d = pad(local.getUTCDate());
    const h = pad(local.getUTCHours());
    const mi = pad(local.getUTCMinutes());
    const s = pad(local.getUTCSeconds());
    return `${y}-${mo}-${d}T${h}:${mi}:${s}-03:00`;
}

class NFeService {
    constructor(pfxPath, password, isProduction = false) {
        const defaultPfxPath = path.join(__dirname, '../certificado/certificado.pfx');
        this.pfxPath = pfxPath || defaultPfxPath;
        this.password = password;
        this.isProduction = isProduction;

        try {
            this.certInfo = this._loadCert();
        } catch (e) {
            throw new Error(`Falha ao ler certificado (.pfx). Verifique se a senha está correta. Detalhes: ${e.message}`);
        }
    }

    _loadCert() {
        if (!fs.existsSync(this.pfxPath)) {
            throw new Error(`Arquivo de certificado não encontrado no caminho: ${this.pfxPath}`);
        }
        
        const pfxFile = fs.readFileSync(this.pfxPath);
        if (pfxFile.length === 0) {
            throw new Error("O arquivo de certificado está vazio (0 bytes).");
        }

        const pfxDer = pfxFile.toString('binary');
        const pfxAsn1 = forge.asn1.fromDer(pfxDer);
        const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, this.password);

        const bags = pfx.getBags({ bagType: forge.pki.oids.certBag });
        const certBag = bags[forge.pki.oids.certBag][0];
        const cert = certBag.cert;

        const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
        const privateKey = keyBag.key;

        return {
            cert: forge.pki.certificateToPem(cert),
            key: forge.pki.privateKeyToPem(privateKey),
            commonName: cert.subject.getField('CN').value
        };
    }

    generateChaveAcesso(params) {
        const { cUF, year, month, cnpj, mod, serie, nNF, tpEmis, cNF } = params;
        const chaveSemDV = `${cUF}${year}${month}${cnpj}${mod}${serie.toString().padStart(3, '0')}${nNF.toString().padStart(9, '0')}${tpEmis}${cNF.toString().padStart(8, '0')}`;
        const dv = this._calculateDV(chaveSemDV);
        return chaveSemDV + dv;
    }

    _calculateDV(chave) {
        let peso = 2;
        let soma = 0;
        for (let i = chave.length - 1; i >= 0; i--) {
            soma += parseInt(chave[i]) * peso;
            peso = (peso === 9) ? 2 : peso + 1;
        }
        const resto = soma % 11;
        return (resto === 0 || resto === 1) ? 0 : 11 - resto;
    }

    createNFeXML(dados) {
        const { ide, emit, dest, det, total, transp, pag, infAdic } = dados;

        const obj = {
            NFe: {
                '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
                infNFe: {
                    '@Id': `NFe${ide.chaveAcesso}`,
                    '@versao': '4.00',
                    ide: {
                        cUF: ide.cUF,
                        cNF: ide.cNF,
                        natOp: ide.natOp,
                        mod: ide.mod,
                        serie: ide.serie,
                        nNF: ide.nNF,
                        dhEmi: ide.dhEmi,
                        tpNF: ide.tpNF,
                        idDest: ide.idDest,
                        cMunFG: ide.cMunFG,
                        tpImp: ide.tpImp,
                        tpEmis: ide.tpEmis,
                        cDV: ide.chaveAcesso.slice(-1),
                        tpAmb: this.isProduction ? '1' : '2',
                        finNFe: ide.finNFe,
                        indFinal: ide.indFinal,
                        indPres: ide.indPres,
                        procEmi: '0',
                        verProc: '1.0.0'
                    },
                    emit: {
                        CNPJ: emit.cnpj,
                        xNome: emit.xNome,
                        xFant: emit.xFant,
                        enderEmit: typeof emit.enderEmit === 'string' ? JSON.parse(emit.enderEmit) : emit.enderEmit,
                        IE: emit.ie,
                        CRT: emit.crt
                    },
                    dest: {
                        CNPJ: (dest.cnpj || '').replace(/\D/g, '') || undefined,
                        CPF: (dest.cpf || '').replace(/\D/g, '') || undefined,
                        xNome: this.isProduction
                            ? dest.xNome
                            : 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
                        enderDest: typeof dest.enderDest === 'string' ? JSON.parse(dest.enderDest) : dest.enderDest,
                        indIEDest: dest.indIEDest || '9',
                        IE: (dest.ie || '').replace(/\D/g, '') || undefined,
                        email: dest.email || undefined
                    },
                    det: det.map((item, index) => ({
                        '@nItem': index + 1,
                        prod: item.prod,
                        imposto: item.imposto
                    })),
                    total: {
                        ICMSTot: total.icmsTot,
                        ...(total.ibscbsTot ? { IBSCBSTot: total.ibscbsTot } : {})
                    },
                    transp: {
                        modFrete: transp.modFrete
                    },
                    pag: {
                        detPag: pag.detPag
                    },
                    infAdic: {
                        infCpl: infAdic.infCpl
                    }
                }
            }
        };

        const xml = create({ version: '1.0', encoding: 'UTF-8' }, obj).end({ prettyPrint: false, headless: true });
        return this._signXML(xml, 'infNFe');
    }

    _signXML(xml, tagId) {
        if (!this.certInfo) {
            throw new Error("Certificado não carregado. Verifique a senha.");
        }

        const sig = new SignedXml({
            privateKey: this.certInfo.key,
            publicCert: this.certInfo.cert,
            signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
            canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        });

        sig.addReference({
            xpath: `//*[local-name(.)='${tagId}']`,
            transforms: [
                'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
            ],
            digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
        });

        sig.keyInfoProvider = {
            getKeyInfo: () =>
                `<X509Data><X509Certificate>${
                    this.certInfo.cert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n|\r/g, '')
                }</X509Certificate></X509Data>`
        };

        sig.computeSignature(xml, {
            location: { xpath: "//*[local-name(.)='NFe']", action: 'append' }
        });

        return sig.getSignedXml();
    }

    _autorizacaoUrls(cUF) {
        const urls = {
            '35': {
                homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx?WSDL',
                producao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx?WSDL'
            }
        };
        return urls[cUF] || null;
    }

    _soapAgent() {
        const https = require('https');
        const pfxBuffer = fs.readFileSync(this.pfxPath);
        return new https.Agent({
            pfx: pfxBuffer,
            passphrase: this.password,
            rejectUnauthorized: false
        });
    }

    // Envia o envelope SOAP 1.2 via HTTPS puro (TLS mutual com o certificado do cliente), sem
    // passar pela serialização automática do pacote `soap`. O WSDL da SEFAZ define o elemento
    // nfeDadosMsg como mixed="true" com <xsd:any/> — ou seja, espera o XML de negócio (enviNFe /
    // envEvento) embutido literalmente dentro de UM único <nfeDadosMsg>. A serialização automática
    // do node-soap duplicava esse wrapper (usando o mesmo nome tanto para o elemento da mensagem
    // WSDL quanto para o valor do parâmetro) e escapava o XML interno como texto
    // (`&lt;enviNFe&gt;...`), produzindo um envelope que a SEFAZ não conseguia interpretar —
    // sempre rejeitado com cStat 242 "Mensagem SOAP inválida", mesmo com o XML da NF-e
    // schema-válido e corretamente assinado. Montar o envelope manualmente resolve isso.
    async _postSoap(url, soapAction, bodyInnerXml) {
        const https = require('https');
        const { hostname, pathname } = new URL(url);
        const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${bodyInnerXml}</soap12:Body></soap12:Envelope>`;
        const agent = this._soapAgent();

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname,
                path: pathname,
                method: 'POST',
                agent,
                timeout: 30000,
                headers: {
                    'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`,
                    'Content-Length': Buffer.byteLength(envelope)
                }
            }, (res) => {
                let data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => resolve(data));
            });
            req.on('timeout', () => req.destroy(new Error('Tempo limite excedido ao conectar com a SEFAZ (30s).')));
            req.on('error', reject);
            req.write(envelope);
            req.end();
        });
    }

    async transmitirSefaz(xmlAssinado, cUF) {
        const urlSet = this._autorizacaoUrls(cUF);
        const baseUrl = urlSet ? (this.isProduction ? urlSet.producao : urlSet.homologacao) : null;

        if (!baseUrl) {
            return { success: false, status: 'nao_configurado', message: `URL da SEFAZ não configurada para a UF (código ${cUF}). A nota NÃO foi transmitida.` };
        }

        try {
            const url = baseUrl.replace(/\?WSDL$/i, '');
            // Estrutura exata exigida pela SEFAZ 4.00: o XML assinado já contém a tag <NFe>,
            // precisamos envolvê-lo em <enviNFe>. Sem declaração XML interna (não é um documento
            // separado, é conteúdo embutido dentro do <nfeDadosMsg>).
            const xmlNFeClean = xmlAssinado.replace(/^<\?xml.*?\?>/, '');
            const enviNFe = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${Math.floor(Date.now() / 1000)}</idLote><indSinc>1</indSinc>${xmlNFeClean}</enviNFe>`;
            const bodyInnerXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${enviNFe}</nfeDadosMsg>`;

            const rawResponse = await this._postSoap(url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote', bodyInnerXml);

            // Log do retorno bruto para depuração na VPS se necessário
            console.log("Retorno SEFAZ:", rawResponse);

            // A nota só está autorizada se o cStat de retorno no protocolo for 100 (Autorizado o uso)
            const isAuthorized = rawResponse && rawResponse.includes('<cStat>100</cStat>');

            if (isAuthorized) {
                const protMatch = rawResponse.match(/<nProt>(\d+)<\/nProt>/);
                if (!protMatch) {
                    // A SEFAZ sinalizou autorização (cStat 100) mas não conseguimos extrair o
                    // protocolo real da resposta. Nunca inventar um número aqui — sem o protocolo
                    // real a nota não pode ser cancelada nem comprovada depois. Reporta como
                    // falha para forçar verificação manual (consulta de protocolo na SEFAZ).
                    return { success: false, status: 'erro_comunicacao', message: 'SEFAZ retornou autorização mas o protocolo não pôde ser lido da resposta. Verifique manualmente na SEFAZ antes de considerar esta nota válida.' };
                }

                return {
                    success: true,
                    status: 'autorizada',
                    protocolo: protMatch[1],
                    cStat: '100',
                    message: 'NF-e Autorizada com Sucesso na SEFAZ'
                };
            } else {
                // Extrai o motivo do erro de dentro do infProt (rejeição da nota) ou do lote
                const infProtMatch = rawResponse.match(/<infProt>([\s\S]*?)<\/infProt>/);
                const searchSource = infProtMatch ? infProtMatch[1] : rawResponse;

                const xMotivoMatch = searchSource.match(/<xMotivo>([^<]+)<\/xMotivo>/);
                const cStatMatch = searchSource.match(/<cStat>([^<]+)<\/cStat>/);
                const motivo = xMotivoMatch ? xMotivoMatch[1] : 'Lote rejeitado ou erro na estrutura SOAP.';
                const cStat = cStatMatch ? cStatMatch[1] : '???';

                return {
                    success: false,
                    status: 'rejeitada',
                    cStat,
                    message: `SEFAZ Rejeitou (cStat ${cStat}): ${motivo}`
                };
            }

        } catch (error) {
            console.error("Erro na transmissão:", error.message);
            return { success: false, status: 'erro_comunicacao', message: `Falha na transmissão: ${error.message}. A nota NÃO foi transmitida.` };
        }
    }

    async cancelarNFe(chaveAcesso, motivo, nProtAutorizacao, cUF, nSeqEvento = 1) {
        const urls = {
            '35': {
                homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx?WSDL',
                producao: 'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx?WSDL'
            }
        };

        const urlSet = urls[cUF] || null;
        const wsdlUrl = urlSet ? (this.isProduction ? urlSet.producao : urlSet.homologacao) : null;

        if (!wsdlUrl) {
            return { success: false, status: 'nao_configurado', message: `URL de eventos da SEFAZ não configurada para a UF (código ${cUF}). O cancelamento NÃO foi transmitido.` };
        }

        try {
            const cnpj = chaveAcesso.substring(6, 20);
            const dhEvento = formatSefazDateTime();
            const tpAmb = this.isProduction ? '1' : '2';
            const seq = String(nSeqEvento).padStart(2, '0');
            const idEvento = `ID110111${chaveAcesso}${seq}`;

            const eventoObj = {
                envEvento: {
                    '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
                    '@versao': '1.00',
                    idLote: Math.floor(Date.now() / 1000),
                    evento: {
                        '@versao': '1.00',
                        infEvento: {
                            '@Id': idEvento,
                            cOrgao: cUF,
                            tpAmb,
                            CNPJ: cnpj,
                            chNFe: chaveAcesso,
                            dhEvento,
                            tpEvento: '110111',
                            nSeqEvento: nSeqEvento,
                            verEvento: '1.00',
                            detEvento: {
                                '@versao': '1.00',
                                descEvento: 'Cancelamento',
                                nProt: nProtAutorizacao,
                                xJust: motivo
                            }
                        }
                    }
                }
            };

            const xml = create({ version: '1.0', encoding: 'UTF-8' }, eventoObj).end({ prettyPrint: false, headless: true });
            const xmlAssinado = this._signXML(xml, 'infEvento');

            const url = wsdlUrl.replace(/\?WSDL$/i, '');
            const bodyInnerXml = `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${xmlAssinado}</nfeDadosMsg>`;
            const rawResponse = await this._postSoap(url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento', bodyInnerXml);

            console.log("Retorno SEFAZ (cancelamento):", rawResponse);

            // cStat 135 = Evento registrado e vinculado a NF-e (cancelamento confirmado)
            const isCancelled = rawResponse && rawResponse.includes('<cStat>135</cStat>');

            if (isCancelled) {
                const protMatch = rawResponse.match(/<nProt>(\d+)<\/nProt>/);
                if (!protMatch) {
                    return { success: false, status: 'erro_comunicacao', message: 'SEFAZ sinalizou cancelamento (cStat 135) mas o protocolo não pôde ser lido da resposta. Verifique manualmente na SEFAZ.' };
                }
                return {
                    success: true,
                    status: 'cancelada',
                    protocolo: protMatch[1],
                    cStat: '135',
                    xmlCancelamento: xmlAssinado,
                    message: 'NF-e cancelada com sucesso na SEFAZ'
                };
            } else {
                const xMotivoMatch = rawResponse.match(/<xMotivo>([^<]+)<\/xMotivo>/);
                const cStatMatch = rawResponse.match(/<cStat>([^<]+)<\/cStat>/);
                const motivoErro = xMotivoMatch ? xMotivoMatch[1] : 'Evento rejeitado ou erro na estrutura SOAP.';
                const cStat = cStatMatch ? cStatMatch[1] : '???';

                return {
                    success: false,
                    status: 'erro_sefaz_cancelamento',
                    cStat,
                    xmlCancelamento: xmlAssinado,
                    message: `SEFAZ Rejeitou o cancelamento (cStat ${cStat}): ${motivoErro}`
                };
            }

        } catch (error) {
            console.error("Erro no cancelamento:", error.message);
            return { success: false, status: 'erro_comunicacao', message: `Falha ao cancelar: ${error.message}. O cancelamento NÃO foi confirmado.` };
        }
    }
}

module.exports = NFeService;
module.exports.formatSefazDateTime = formatSefazDateTime;
