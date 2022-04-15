const express = require('express');
const app = express();

const mongoose = require('mongoose');
const Transaction = require('./model/transaction');

let client;
(async () => {
    const redis = require('redis');
    const redisUrl = 'redis://redisdb:6379';
    client = redis.createClient({url: redisUrl});
    try{
        await client.connect();
    }catch(err){
        console.log(JSON.stringify(err, null, 2));

        const error = new Error('Não foi possível conectar ao redis. Tente novamente.')
        return console.error(error);
}
})()


// CORS headers
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
})

// Setando middleware para leitura de solicitações de entrada
app.use(express.json())

app.post('/register', async (req, res, next) => {

    console.log(req.body);

    // Coletar dados necessários do corpo de entrada
    const { conta_corrente_id, meio_pagamento, quantia } = req.body;

    // Passar dados para o esquema 'Transaction' e salvar no banco MONGODB
    let newTransaction;
    try{
        newTransaction = await new Transaction({
            current_account_id: conta_corrente_id,
            transaction_method: meio_pagamento,
            entry_balance: quantia
        }).save()
    }catch(err){
        const error  = new Error(err.message);
        error.statusCode = 500;
        next(error);
    }

    // Atualizar cache
    try{
        // Vamos usar a chave 'conta_corrente_id'
    const key = conta_corrente_id;
    // Verificando se essa chave está cadastrada em cache
    const cachedValue = await client.get(key);
    if(cachedValue){
        // Se estiver deleta a chave, atualiza o saldo e salva.
        client.del(key);

        const newBalance = parseFloat(cachedValue) + quantia;
        await client.set(key, newBalance, { 'EX': 60 }); // Setando uma expiração de 60 segundos
        console.log(key, await client.get(key));
    }else{
        // Se não, vamos cadastrar a chave 'conta_corrente_id'.
        await client.set(key, quantia, { 'EX': 60 }); // Setando uma expiração de 60 segundos
        console.log(key, await client.get(key));
    }
    // [NOTA]: Como estamos em teste e queremos ver a expiração de dados em ação, foi posto uma
    // expiração de 60 segundos. Consideramos que esse seja um tempo razoável para esse fim.

    }catch(err){
        // Aqui vamos apenas logar o erro, pois não queremos para a execução apenas porque não foi possível salvar o saldo em memória!
        console.log(JSON.stringify(err, null, 2));
    }
    
    res.status(200).json({
        message: 'Saldo registrado com sucesso!',
        data: newTransaction._doc
    })
});

app.get('/rebalancer', async (req, res, next) => {
    let auxObj;
    try{
       
        // Buscando todas as informações do banco
        const allEntries = await Transaction.find({});
        console.log(allEntries);

        
        // cada chave é um id de conta corrente e cada valor é o total da conta
        auxObj = {};
        for(let key of allEntries){
            console.log('key', key)
            auxObj[key.current_account_id] = (auxObj[key.current_account_id] || 0) + key.entry_balance
        }

    }catch(err){
        const error  = new Error(err.message);
        error.statusCode = 500;
        next(error);
    }
    
    // Atualizar cache
    try{

        for(objKey in auxObj){
            // Vamos usar a chave de forma dinâmica
            const key = objKey;

            // Para cada chave, estamos setando o seu respectivo valor.
            await client.set(key, auxObj[objKey], { 'EX': 60 * 5 }); // Setando uma expiração de 5 minutos
            // [NOTA]: Aqui foi posto um tempo maior de expiração justamente por causa do objetivo desse endpoint:
            // recuperar novamente o total da quantia
        }
    }catch(err){
        // Se der erro no cache, nesse ponto, queremos para a execução nesse endpoint. Pois aqui o objetivo desse enpoint não será alcançado.
        const error  = new Error(err.message);
        error.statusCode = 500;
        next(error);
    }
   

    res.json({message: 'Registro de quantia total atualizado com sucesso!'})
});

// Setando middleware de gerenciamento de erros
app.use(( error, req, res, next ) => {

    console.log(JSON.stringify(error, null, 2));

    const errorStatusCode = error.statusCode || 500; 
    const errorMessage = error.message;
    
    res.status(errorStatusCode).json({
        errorStatusCode: errorStatusCode,
        message: errorMessage
    });

})


mongoose.connect('mongodb://mongodb:27017/arch', (err) => {
    if(err){
        return console.error(err);
    }

    app.listen(80, () => {
        console.info('Rodando na porta 80.');
    })
});
