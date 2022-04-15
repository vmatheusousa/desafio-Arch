const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Transaction = new Schema({
    transaction_method: {
            type: String,
            enum : ['debito', 'credito'],
            required: true
    },
    entry_balance: {
        type: Number,
        required: true
    },
    current_account_id: {
        type: String,
        required: true
    },
}, { timestamp: true })

module.exports = mongoose.model('Transaction', Transaction);