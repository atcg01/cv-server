const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const os = require('os');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const baseDir = "C:\\Users\\Nicolas\\Documents\\Pascale\\jsonServer\\resources";

app.use(cors({
  exposedHeaders: ['Content-Range', 'Content-Length', 'Content-Type'],
}));
app.use(express.json());

let tempDirectory = "";

async function generateHTML(jsonData) {
  const handlebars = require('handlebars');
  try {
    // Lire le template
    const templatePath = path.join(__dirname, 'template_' + jsonData.lang + '.hbs');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    const html = template(jsonData);
    console.log('✅ HTML généré avec succès');
    return html;
  } catch (err) {
    console.error('❌ Erreur lors de la génération du HTML :', err);
  }
}

async function initTempDirectory() {
  const { mkdtemp } = require('fs/promises');
  const { join } = require('path');
  const { tmpdir } = require('os');
  try {
    tempDirectory = await mkdtemp(tmpdir());
    console.log(`Created temporary directory ${tempDirectory}`);
  } catch (error) {
    console.error(`Got an error trying to create the temporary directory: ${error.message}`);
  }
}

// Helper: get file path
const getFilePath = (resource) =>
  path.join(baseDir, resource, 'data.json');

// GET /resource
app.get('/:resource', async (req, res) => {
  const { resource } = req.params;
  const filePath = getFilePath(resource);
  try {
    const file = await fs.readFile(filePath, 'utf-8');
    let data = JSON.parse(file);

    // Pagination
    const { _start = 0, _end = data.length, _sort, _order = 'ASC' } = req.query;
    if (_sort) {
      data.sort((a, b) => {
        if (a[_sort] > b[_sort]) return _order === 'ASC' ? 1 : -1;
        if (a[_sort] < b[_sort]) return _order === 'ASC' ? -1 : 1;
        return 0;
      });
    }

    const sliced = data.slice(Number(_start), Number(_end));
    res.set('Content-Range', data.length);
    res.json(sliced);
  } catch (err) {
    console.log(err)
    res.status(500).json({ error: 'Error reading data file.' });
  }
});

app.get('/cvs/:id/download', async (req, res) => {
  const { join } = require('path');
  const fs = require("fs");
  const fpath = path.join(tempDirectory, 'cv.pdf');

  const { id } = req.params;
  const filePath = getFilePath("cvs");
  const puppeteer = require('puppeteer');
  const file = fs.readFileSync(filePath);
  const data = JSON.parse(file);
  const item = data.find(d => String(d.id) === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  await (async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const html = await generateHTML(item);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    await page.pdf({
      path: fpath,
      format: 'A4',
      printBackground: true
    });

    await browser.close();
  })();
  const stream = fs.createReadStream(fpath);
  const stat = fs.statSync(fpath);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=cv.pdf');
  stream.pipe(res);
});

// GET /resource/:id
app.get('/:resource/:id', async (req, res) => {
  const { resource, id } = req.params;
  const filePath = getFilePath(resource);

  try {
    const file = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(file);
    const item = data.find(d => String(d.id) === id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Error reading data file.' });
  }
});

// POST /resource
app.post('/:resource', async (req, res) => {
  const { resource } = req.params;
  const filePath = getFilePath(resource);
  const newItem = req.body;

  try {
    const file = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(file);
    const id = data.length ? Math.max(...data.map(i => i.id || 0)) + 1 : 1;
    const item = { id, ...newItem };
    data.push(item);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    res.status(201).json(item);
  } catch {
    res.status(500).json({ error: 'Error writing data file.' });
  }
});

// PUT /resource/:id
app.put('/:resource/:id', async (req, res) => {
  const { resource, id } = req.params;
  const filePath = getFilePath(resource);
  const update = req.body;

  try {
    const file = await fs.readFile(filePath, 'utf-8');
    let data = JSON.parse(file);
    const index = data.findIndex(i => String(i.id) === id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });
    data[index] = { ...data[index], ...update };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    res.json(data[index]);
  } catch {
    res.status(500).json({ error: 'Error updating data file.' });
  }
});

// DELETE /resource/:id
app.delete('/:resource/:id', async (req, res) => {
  const { resource, id } = req.params;
  const filePath = getFilePath(resource);

  try {
    const file = await fs.readFile(filePath, 'utf-8');
    let data = JSON.parse(file);
    const index = data.findIndex(i => String(i.id) === id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });
    const [removed] = data.splice(index, 1);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    res.json(removed);
  } catch {
    res.status(500).json({ error: 'Error deleting data file.' });
  }
});

initTempDirectory();

app.listen(PORT, () => {
  console.log(`✅ JSON API running at http://localhost:${PORT}`);
});

