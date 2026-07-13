const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const soap = require('soap');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("=== Iniciando teste de conexão SOAP com SEFAZ SP ===");

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
    
    try {
        const forge = require('node-forge');
        const pfxFile = fs.readFileSync(pfxPath);
        const pfxDer = pfxFile.toString('binary');
        const pfxAsn1 = forge.asn1.fromDer(pfxDer);
        const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, certPassword);
        const bags = pfx.getBags({ bagType: forge.pki.oids.certBag });
        const cert = bags[forge.pki.oids.certBag][0].cert;
        
        console.log("✅ Certificado decifrado com sucesso!");
        console.log("CN:", cert.subject.getField('CN').value);
        console.log("Válido De:", cert.validity.notBefore);
        console.log("Válido Até:", cert.validity.notAfter);
        
        const now = new Date();
        if (now > cert.validity.notAfter) {
            console.log("❌ ATENÇÃO: CERTIFICADO EXPIRADO!");
        } else if (now < cert.validity.notBefore) {
            console.log("❌ ATENÇÃO: CERTIFICADO AINDA NÃO É VÁLIDO!");
        } else {
            console.log("✅ Certificado dentro do prazo de validade.");
        }
    } catch (certErr) {
        console.error("❌ Erro ao ler certificado:", certErr.message);
    }

    const urls = {
        homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx?WSDL',
        producao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx?WSDL'
    };

    const https = require('https');
    const pfxBuffer = fs.readFileSync(pfxPath);
    const agent = new https.Agent({
        pfx: pfxBuffer,
        passphrase: certPassword,
        rejectUnauthorized: false
    });

    // 1. Testar Homologação
    console.log("\n--- Testando conexão com Homologação (Ambiente de Teste) ---");
    soap.createClient(urls.homologacao, {
        httpsAgent: agent,
        wsdl_options: {
            httpsAgent: agent,
            rejectUnauthorized: false
        }
    }, (errHomol, clientHomol) => {
        if (errHomol) {
            console.log("❌ Falha na Homologação:", errHomol.message);
        } else {
            console.log("✅ Sucesso ao conectar com a Homologação da SEFAZ SP!");
        }

        // 2. Testar Produção
        console.log("\n--- Testando conexão com Produção (Ambiente Real) ---");
        soap.createClient(urls.producao, {
            httpsAgent: agent,
            wsdl_options: {
                httpsAgent: agent,
                rejectUnauthorized: false
            }
        }, (errProd, clientProd) => {
            if (errProd) {
                console.log("❌ Falha na Produção:", errProd.message);
            } else {
                console.log("✅ Sucesso ao conectar com a Produção da SEFAZ SP!");
            }
            process.exit(0);
        });
    });
});
