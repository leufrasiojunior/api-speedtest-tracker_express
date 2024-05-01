const express = require('express');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUI = require('swagger-ui-express');
const mariadb = require('mariadb');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');

dotenv.config();

const PORT = process.env.PORT_HOST || 3000;



const app = express();
app.use(morgan('combined'));
app.use(cors());



const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5
});

const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'API Documentation',
            version: '1.0.0',
            description: 'Documentação da API usando Swagger',
        },
    },
    apis: ['./server.js'], // Aponte para o arquivo principal onde suas rotas estão definidas
};

/**
 * @swagger
 * /downloads:
 *   get:
 *     summary: Retorna os downloads de hoje
 *     responses:
 *       200:
 *         description: Retorna um array de downloads de hoje
 */app.get('/downloads', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const today = new Date();
        const sql = `SELECT DATE(created_at) AS date, download FROM results WHERE DATE(created_at) = DATE(UTC_TIMESTAMP())`;
        const rows = await conn.query(sql);
        const downloads = rows.map(row => ({ date: row.date.toISOString(), download: Number(row.download) }));
        res.json(downloads);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});
/**
 * @swagger
 * /uploads:
 *   get:
 *     summary: Retorna os uploads de hoje
 *     responses:
 *       200:
 *         description: Retorna um array de uploads de hoje
 */
app.get('/uploads', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const today = new Date();
        const sql = `SELECT upload FROM results WHERE DATE(created_at) = DATE(UTC_TIMESTAMP())`;
        const rows = await conn.query(sql);
        const uploads = rows.map(row => Number(row.upload));
        res.json(uploads);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});
/**
 * @swagger
 * /pings:
 *   get:
 *     summary: Retorna os pings de hoje
 *     responses:
 *       200:
 *         description: Retorna um array de pings de hoje
 */
app.get('/pings', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const today = new Date();
        const sql = `SELECT ping FROM results WHERE DATE(created_at) = DATE(UTC_TIMESTAMP())`;
        const rows = await conn.query(sql);
        const pings = rows.map(row => Number(row.ping));
        res.json(pings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});
/**
 * @swagger
 * /averages:
 *   get:
 *     summary: Retorna as médias de hoje
 *     responses:
 *       200:
 *         description: Retorna as médias de download, upload e ping de hoje
 */
app.get('/averages', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const sql = `SELECT AVG(download) AS avg_download, AVG(upload) AS avg_upload, AVG(ping) AS avg_ping FROM results WHERE DATE(created_at) = DATE(UTC_TIMESTAMP())`;
        const rows = await conn.query(sql);
        const { avg_download, avg_upload, avg_ping } = rows[0];
        res.json({
            averageDownload: Number(avg_download),
            averageUpload: Number(avg_upload),
            averagePing: Number(avg_ping)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release();
    }
});
/**
 * @swagger
 * /allresults:
 *   get:
 *     summary: Retorna todos os resultados
 *     responses:
 *       200:
 *         description: Retorna todos os resultados
 */
app.get('/allresults', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const sql = `SELECT * FROM results`;
        const rows = await conn.query(sql);
        const results = rows.map(row => {
            const formattedRow = {};
            for (const [key, value] of Object.entries(row)) {
                formattedRow[key] = typeof value === 'bigint' ? Number(value) : value;
            }
            return formattedRow;
        });
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release();
    }
});
/**
 * @swagger
 * /fulldata:
 *   get:
 *     summary: Retorna todos os dados completos
 *     responses:
 *       200:
 *         description: Retorna todos os dados completos
 */
// Route to get all data from the 'DATA' column
app.get('/fulldata', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const sql = `SELECT DATA FROM results`;
        const rows = await conn.query(sql);
        // Extracting the values from the result rows
        const data = rows.map(row => row.DATA);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});

/**
 * @swagger
 * /list:
 *   get:
 *     summary: Retorna uma lista paginada de resultados
 *     parameters:
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Quantidade de resultados por página
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número da página
 *     responses:
 *       200:
 *         description: Retorna uma lista paginada de resultados
 */
// Route to list data with pagination
app.get('/list', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        // Quantidade de dados a serem mostrados por página
        const pageSize = parseInt(req.query.pageSize) || 10;

        // Calcula o número total de registros na tabela
        const countRows = await conn.query(`SELECT COUNT(*) as totalRows FROM results `);
        const totalRows = Number(countRows[0].totalRows);

        // Calcula a quantidade total de páginas
        const totalPages = Math.ceil(totalRows / pageSize);

        // Página atual (padrão: 1)
        const page = parseInt(req.query.page) || 1;

        // Calcula quantas páginas ainda restam
        const remainingPages = totalPages - page;

        // Realiza a consulta para obter os dados com paginação
        const offset = (page - 1) * pageSize;
        const sql = `SELECT * FROM results ORDER BY ID DESC LIMIT ${offset}, ${pageSize}`;
        const rows = await conn.query(sql);

        // Convertendo BigInt para Number
        const data = rows.map(row => {
            const formattedRow = {};
            for (const [key, value] of Object.entries(row)) {
                formattedRow[key] = typeof value === 'bigint' ? Number(value) : value;
            }
            return formattedRow;
        });

        res.json({
            totalRows,
            totalPages,
            remainingPages,
            data,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release(); // Libera a conexão de volta para o pool
    }
});
/**
 * @swagger
 * /specified/{id}:
 *   get:
 *     summary: Retorna um resultado específico pelo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do resultado a ser retornado
 *     responses:
 *       200:
 *         description: Retorna o resultado especificado pelo ID
 *       404:
 *         description: Resultado não encontrado
 */
// Route to get data by ID
app.get('/specified/:id', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const id = req.params.id;
        const sql = `SELECT data FROM results WHERE ID = ${id}`;
        const row = await conn.query(sql, [id]);
        
        if (row.length === 0) {
            res.status(404).json({ error: 'Data not found' });
            return;
        }
        
        const data = row[0].data;
        res.json({ data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/', swaggerUI.serve, swaggerUI.setup(swaggerSpec));
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
