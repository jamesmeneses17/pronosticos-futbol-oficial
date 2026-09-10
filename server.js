require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('./')); // Servir los archivos estáticos desde la misma carpeta

let pool;

async function initDb() {
  try {
    // 1. Conexión inicial sin base de datos para asegurar que exista
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

    console.log('Conectado a MySQL con éxito.');

    // 2. Crear la base de datos si no existe
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    console.log(`Base de datos ${process.env.DB_NAME} verificada/creada.`);
    
    await connection.end();

    // 3. Crear el pool de conexiones usando la base de datos
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // 4. Crear la tabla de pronósticos si no existe
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS pronosticos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        local VARCHAR(100) NOT NULL,
        visitante VARCHAR(100) NOT NULL,
        competicion VARCHAR(100),
        gemini_pred TEXT,
        chatgpt_pred TEXT,
        claude_pred TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await pool.query(createTableQuery);
    console.log('Tabla "pronosticos" verificada/creada.');

    try {
      await pool.query('ALTER TABLE pronosticos ADD COLUMN resultado_final VARCHAR(100)');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await pool.query('ALTER TABLE pronosticos ADD COLUMN gemini_hit VARCHAR(10)');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await pool.query('ALTER TABLE pronosticos ADD COLUMN chatgpt_hit VARCHAR(10)');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try {
      await pool.query('ALTER TABLE pronosticos ADD COLUMN claude_hit VARCHAR(10)');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    console.log('Columnas adicionales verificadas.');

  } catch (err) {
    console.error('Error inicializando la base de datos:', err);
    process.exit(1); // Detener el servidor si no hay conexión a DB
  }
}

// Inicializar DB antes de arrancar el servidor
initDb().then(() => {
  
  // Endpoint para guardar un nuevo pronóstico
  app.post('/api/pronosticos', async (req, res) => {
    try {
      const { local, visitante, competicion, gemini_pred, chatgpt_pred, claude_pred } = req.body;
      
      const [existing] = await pool.query('SELECT * FROM pronosticos WHERE local = ? AND visitante = ? AND resultado_final IS NULL ORDER BY created_at DESC LIMIT 1', [local || '', visitante || '']);
      
      if (existing.length > 0) {
        const id = existing[0].id;
        const g = gemini_pred || existing[0].gemini_pred;
        const c = chatgpt_pred || existing[0].chatgpt_pred;
        const cl = claude_pred || existing[0].claude_pred;
        await pool.query('UPDATE pronosticos SET gemini_pred = ?, chatgpt_pred = ?, claude_pred = ? WHERE id = ?', [g, c, cl, id]);
        res.status(200).json({ id, message: 'Pronóstico actualizado.' });
      } else {
        const query = `
          INSERT INTO pronosticos 
          (local, visitante, competicion, gemini_pred, chatgpt_pred, claude_pred) 
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
          local || '', 
          visitante || '', 
          competicion || '', 
          gemini_pred || '', 
          chatgpt_pred || '', 
          claude_pred || ''
        ]);
        
        res.status(201).json({ id: result.insertId, message: 'Pronóstico guardado exitosamente.' });
      }
    } catch (err) {
      console.error('Error al guardar pronóstico:', err);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // Endpoint para obtener todos los pronósticos
  app.get('/api/pronosticos', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM pronosticos ORDER BY created_at DESC');
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener pronósticos:', err);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // Endpoint para actualizar el resultado final
  app.put('/api/pronosticos/:id/resultado', async (req, res) => {
    try {
      const { resultado } = req.body;
      const id = req.params.id;
      await pool.query('UPDATE pronosticos SET resultado_final = ? WHERE id = ?', [resultado, id]);
      res.json({ message: 'Resultado actualizado exitosamente.' });
    } catch (err) {
      console.error('Error al actualizar resultado:', err);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // Endpoint para actualizar si una IA acertó o falló
  app.put('/api/pronosticos/:id/hit', async (req, res) => {
    try {
      const { ia, hit } = req.body; // ia: 'gemini', 'chatgpt', 'claude'. hit: 'yes', 'no', null
      const id = req.params.id;
      const col = ia + '_hit';
      await pool.query(`UPDATE pronosticos SET ${col} = ? WHERE id = ?`, [hit, id]);
      res.json({ message: 'Estado actualizado' });
    } catch (err) {
      console.error('Error al actualizar hit:', err);
      res.status(500).json({ error: 'Error interno' });
    }
  });

  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });
});
