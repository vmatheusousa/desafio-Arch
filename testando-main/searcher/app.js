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


app.get('/search/:current_account_id', async (req, res, next) => {

    const currentAccountId = req.params.current_account_id;

    // Buscar o total desse ID em cache
    const cachedTotal = await client.get(currentAccountId);
    if(cachedTotal){
        return res.status(200).json({ message: 'Dados recuperados do cache', data: cachedTotal });
    }

    // Não está em cache, vamos buscar no mongodb
    const findByAccountId = await Transaction.find({current_account_id: currentAccountId});
    const totalBalance = findByAccountId.reduce((acc, current) => acc + current.entry_balance , 0);
    console.log(totalBalance);
    
    // Salvar em cache
    await client.set(currentAccountId, totalBalance);

    // Mandar resposta
    return res.status(200).json({ message: 'Dados recuperados do mongodb', data: totalBalance });

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

    app.listen(8000, () => {
        console.info('Rodando na porta 8000.');
    })
});
