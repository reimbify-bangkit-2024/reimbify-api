const pool = require('../config/pool'); // Import Cloud SQL connection pool
const { decrypt } = require('../utils/encryption');

// Create a receipt
exports.createReceipt = async (receipt) => {
    const query = `
        INSERT INTO receipt (requester_id, department_id, account_id, receipt_date, description, amount, request_date, status, receipt_image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const { requesterId, departmentId, accountId, receiptDate, description, amount, receiptImageUrl } = receipt;
    const requestDate = new Date(); // Set requestDate to current time

    try {
        await pool.query(query, [
            requesterId, departmentId, accountId, receiptDate, description, amount, requestDate, 'under_review', receiptImageUrl
        ]);
    } catch (err) {
        throw err;
    }
};

function formatReceipt(receipt) {
    return {
        receiptId: receipt.receipt_id,
        requester: {
            userId: receipt.user_id,
            userName: receipt.user_name,
            email: receipt.email
        },
        department: {
            departmentId: receipt.department_id,
            departmentName: receipt.department_name
        },
        account: {
            accountId: receipt.account_id,
            accountTitle: receipt.account_title,
            accountHolderName: receipt.account_holder_name,
            accountNumber: decrypt(receipt.account_number_encrypted),
            bank: {
                bankId: receipt.bank_id,
                bankName: receipt.bank_name
            }
        },
        receiptDate: receipt.receipt_date,
        description: receipt.description,
        amount: receipt.amount,
        requestDate: receipt.request_date,
        status: receipt.status,
        receiptImageUrl: receipt.receipt_image_url,
        approval: {
            admin: receipt.admin_id
                ? {
                    adminId: receipt.admin_id,
                    adminName: receipt.admin_name,
                    adminEmail: receipt.admin_email
                }
                : null,
            responseDate: receipt.response_date,
            transferImageUrl: receipt.transfer_image_url,
            responseDescription: receipt.response_description
        }
    };
}

exports.getReceipts = async ({ receiptId, userId, sorted, search, departmentId, status }) => {
    const conditions = [];
    const values = [];

    // Add conditions based on parameters
    if (receiptId) {
        conditions.push('r.receipt_id = ?');
        values.push(receiptId);
    }
    if (userId) {
        conditions.push('r.requester_id = ?');
        values.push(userId);
    }
    if (search) {
        conditions.push('(LOWER(r.description) LIKE ? OR LOWER(u.user_name) LIKE ? OR LOWER(u.email) LIKE ?)');
        const searchTerm = `%${search.toLowerCase()}%`;
        values.push(searchTerm, searchTerm, searchTerm);
    }
    if (departmentId) {
        conditions.push('r.department_id = ?');
        values.push(departmentId);
    }
    if (status) {
        const statuses = status.split(',').map((s) => s.trim());
        conditions.push(`r.status IN (${statuses.map(() => '?').join(', ')})`);
        values.push(...statuses);
    }

    // Base query
    let query = `
        SELECT 
            r.*,
            u.user_id, u.user_name, u.email,
            d.department_id, d.department_name,
            ba.account_id, ba.account_title, ba.account_holder_name, ba.account_number_encrypted,
            b.bank_id, b.bank_name,
            admin.user_id AS admin_id, admin.user_name AS admin_name, admin.email AS admin_email,
            r.response_date, r.transfer_image_url, r.response_description
        FROM receipt r
        JOIN user u ON r.requester_id = u.user_id
        JOIN department d ON r.department_id = d.department_id
        JOIN bank_account ba ON r.account_id = ba.account_id
        JOIN bank b ON ba.bank_id = b.bank_id
        LEFT JOIN user admin ON r.admin_id = admin.user_id
    `;

    // Add WHERE clause if conditions exist
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add sorting clause
    if (sorted) {
        const [column, direction] = sorted.split(':');
        const allowedColumns = ['request_date', 'status', 'amount']; // Define allowed columns
        if (allowedColumns.includes(column) && ['asc', 'desc'].includes(direction.toLowerCase())) {
            query += ` ORDER BY r.${column} ${direction.toUpperCase()}`;
        } else {
            query += ' ORDER BY r.request_date DESC'; // Default sorting
        }
    } else {
        query += ' ORDER BY r.request_date DESC'; // Default sorting
    }

    // Execute query
    const [rows] = await pool.query(query, values);
    return rows.map(formatReceipt);
};

// Update receipt by ID
exports.updateReceipt = async (receiptId, updatedData) => {
    const query = `
        UPDATE receipt
        SET requester_id = ?, department_id = ?, account_id = ?, receipt_date = ?, description = ?, amount = ?, receipt_image_url = ?
        WHERE receipt_id = ?
    `;
    const { requesterId, departmentId, accountId, receiptDate, description, amount, receiptImageUrl } = updatedData;

    try {
        await pool.query(query, [
            requesterId, departmentId, accountId, receiptDate, description, amount, receiptImageUrl, receiptId
        ]);
    } catch (err) {
        throw err;
    }
};

// Delete receipt by ID
exports.deleteReceiptById = async (receiptId) => {
    const query = `
        DELETE FROM receipt WHERE receipt_id = ?
    `;
    try {
        await pool.query(query, [receiptId]);
    } catch (err) {
        throw err;
    }
};

// Update receipt approval or rejection
exports.updateReceiptApproval = async (receiptId, { status, adminId, responseDate, responseDescription, transferImageUrl }) => {
    const query = `
        UPDATE receipt
        SET 
            status = ?, 
            admin_id = ?, 
            response_date = ?, 
            response_description = ?, 
            transfer_image_url = ?
        WHERE receipt_id = ?
    `;

    try {
        await pool.query(query, [status, adminId, responseDate, responseDescription, transferImageUrl, receiptId]);
    } catch (err) {
        throw err;
    }
};
