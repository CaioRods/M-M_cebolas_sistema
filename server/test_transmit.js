const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const NFeService = require('./nfe-service');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("=== Iniciando teste de comunicação com a SEFAZ SP (Homologação) ===");

db.all('SELECT chave, valor FROM configs', [], async (err, rows) => {
    if (err) {
        console.error("Erro ao ler configurações:", err.message);
        process.exit(1);
    }

    const configMap = {};
    rows?.forEach(c => configMap[c.chave] = c.valor);

    const certPassword = configMap['cert_password'] || '12345678';
    const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');

    console.log(`Lendo certificado de: ${pfxPath}`);
    console.log(`Usando senha configurada...`);

    try {
        // Enforça isProduction = false para garantir teste em HOMOLOGAÇÃO
        const nfeService = new NFeService(pfxPath, certPassword, false);
        console.log("✅ Certificado carregado e decifrado com sucesso!");
        console.log(`Common Name (CN): ${nfeService.certInfo.commonName}`);

        // Vamos montar os dados de uma NFe de teste
        const cNF = Math.floor(Math.random() * 100000000);
        
        const chaveParams = {
            cUF: '35',
            year: new Date().getFullYear().toString().slice(-2),
            month: String(new Date().getMonth() + 1).padStart(2, '0'),
            cnpj: (configMap['emit_cnpj'] || '56421395000150').replace(/\D/g, ''),
            mod: '55',
            serie: 1,
            nNF: 999, // Número de teste
            tpEmis: '1',
            cNF
        };
        
        const chaveAcesso = nfeService.generateChaveAcesso(chaveParams);
        console.log(`Chave de acesso gerada para teste: ${chaveAcesso}`);

        const nfeData = {
            ide: {
                cUF: '35',
                cNF,
                natOp: 'Venda de mercadoria de teste',
                mod: 55,
                serie: 1,
                nNF: 999,
                dhEmi: new Date().toISOString(),
                tpNF: '1',
                idDest: '1',
                cMunFG: '3541406',
                tpImp: '2',
                tpEmis: '1',
                chaveAcesso,
                finNFe: '1',
                indFinal: '1',
                indPres: '1'
            },
            emit: {
                cnpj: (configMap['emit_cnpj'] || '56421395000150').replace(/\D/g, ''),
                xNome: configMap['emit_nome'] || 'M & M HF COMERCIO DE CEBOLAS LTDA',
                xFant: configMap['emit_fant'] || 'M & M HF COMERCIO DE CEBOLAS',
                enderEmit: {
                    xLgr: configMap['emit_lgr'] || 'RUA MANOEL CRUZ',
                    nro: configMap['emit_nro'] || '36',
                    xBairro: configMap['emit_bairro'] || 'RESIDENCIAL MINERVA I',
                    cMun: configMap['emit_cmun'] || '3541406',
                    xMun: configMap['emit_xmun'] || 'PRESIDENTE PRUDENTE',
                    UF: configMap['emit_uf'] || 'SP',
                    CEP: configMap['emit_cep'] || '19026168',
                    cPais: '1058',
                    xPais: 'BRASIL'
                },
                ie: (configMap['emit_ie'] || '562696411110').replace(/\D/g, ''),
                crt: configMap['emit_crt'] || '3'
            },
            dest: {
                cnpj: '99999999000191', // CNPJ de teste em homologação
                xNome: 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
                enderDest: {
                    xLgr: 'AVENIDA PAULISTA',
                    nro: '1000',
                    xBairro: 'BELA VISTA',
                    cMun: '3550308',
                    xMun: 'SAO PAULO',
                    UF: 'SP',
                    CEP: '01310100',
                    cPais: '1058',
                    xPais: 'BRASIL'
                },
                indIEDest: '9',
                ie: ''
            },
            det: [
                {
                    prod: {
                        cProd: '01',
                        cEAN: 'SEM GTIN',
                        xProd: 'CEBOLA NACIONAL MEDIA',
                        NCM: '07031019',
                        CFOP: '5102',
                        uCom: 'CX',
                        qCom: '1.0000',
                        vUnCom: '50.0000',
                        vProd: '50.00',
                        cEANTrib: 'SEM GTIN',
                        uTrib: 'CX',
                        qTrib: '1.0000',
                        vUnTrib: '50.0000',
                        indTot: '1'
                    },
                    imposto: {
                        vTotTrib: '0.00',
                        ICMS: {
                            ICMS40: {
                                orig: '0',
                                CST: '40'
                            }
                        },
                        PIS: {
                            PISOutr: {
                                CST: '49',
                                vBC: '0.00',
                                pPIS: '0.00',
                                vPIS: '0.00'
                            }
                        },
                        COFINS: {
                            COFINSOutr: {
                                CST: '49',
                                vBC: '0.00',
                                pCOFINS: '0.00',
                                vCOFINS: '0.00'
                            }
                        }
                    }
                }
            ],
            total: {
                icmsTot: {
                    vBC: '0.00',
                    vICMS: '0.00',
                    vICMSDeson: '0.00',
                    vFCPUFDest: '0.00',
                    vICMSUFDest: '0.00',
                    vICMSUFRemet: '0.00',
                    vFCP: '0.00',
                    vBCST: '0.00',
                    vST: '0.00',
                    vFCPST: '0.00',
                    vFCPSTRet: '0.00',
                    vProd: '50.00',
                    vFrete: '0.00',
                    vSeg: '0.00',
                    vDesc: '0.00',
                    vII: '0.00',
                    vIPI: '0.00',
                    vIPIDevol: '0.00',
                    vPIS: '0.00',
                    vCOFINS: '0.00',
                    vOutro: '0.00',
                    vNF: '50.00',
                    vTotTrib: '0.00'
                }
            },
            transp: {
                modFrete: '9'
            },
            infAdic: {
                infCpl: 'Nota Fiscal emitida para teste de transmissao.'
            }
        };

        console.log("Gerando e assinando XML de teste...");
        const xmlAssinado = nfeService.createNFeXML(nfeData);
        console.log("✅ XML assinado com sucesso!");
        
        console.log("Iniciando conexao HTTPS e transmissao para a SEFAZ SP...");
        const response = await nfeService.transmitirSefaz(xmlAssinado, '35');
        
        console.log("\n================ RETORNO DA SEFAZ ================");
        console.log("Sucesso:", response.success);
        console.log("Status:", response.status);
        console.log("Mensagem:", response.message);
        console.log("Protocolo:", response.protocol || 'N/A');
        console.log("==================================================");

        process.exit(0);
    } catch (e) {
        console.error("\n❌ FALHA NO TESTE:", e.message);
        process.exit(1);
    }
});
