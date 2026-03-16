/**
 * ═══════════════════════════════════════════════════════════════════
 * ALTEC VAE — encuesta.js
 * Backend Express server — Inscripción de Encuesta
 * ───────────────────────────────────────────────────────────────────
 *
 * Expone dos endpoints:
 *
 *   POST /api/subscribe   — recibe { email }
 *                           → envía correo de confirmación al usuario
 *                             (plantilla: email-confirmation.html)
 *
 *   POST /api/survey      — recibe { email, nombre, region, comuna, telefono }
 *                           → genera un Excel con los datos
 *                           → lo envía como adjunto al correo destinatario
 *
 * ───────────────────────────────────────────────────────────────────
 * INSTALACIÓN DE DEPENDENCIAS
 *
 *   npm install express nodemailer exceljs cors dotenv
 *
 * VARIABLES DE ENTORNO (.env o environment variables):
 *
 *   SMTP_HOST      Host del servidor SMTP      (ej: smtp.gmail.com)
 *   SMTP_PORT      Puerto SMTP                 (ej: 587)
 *   SMTP_USER      Usuario / correo remitente  (ej: noreply@altecvae.cl)
 *   SMTP_PASS      Contraseña o App Password
 *   FROM_EMAIL     Dirección "De"              (puede ser igual a SMTP_USER)
 *   PORT           Puerto HTTP del servidor    (default: 3000)
 *
 * ───────────────────────────────────────────────────────────────────
 * USO
 *
 *   node encuesta.js
 *
 * El servidor sirve también los archivos estáticos del sitio desde
 * el mismo directorio raíz (index.html, style.css, main.js, etc.)
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const nodemailer = require('nodemailer');
const ExcelJS    = require('exceljs');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serve HTML/CSS/JS

/* ──────────────────────────────────────────────────────────────────
   ⚠️  CORREO DESTINATARIO DE EXCELS
   Cambia esta constante por el correo que debe recibir los excels
   con los datos de los inscritos.
   ────────────────────────────────────────────────────────────────── */
const EXCEL_RECIPIENT = 'CORREO_DESTINATARIO@ejemplo.cl';  // ← MODIFICAR

/* ──────────────────────────────────────────────────────────────────
   SMTP Transporter
   ────────────────────────────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ──────────────────────────────────────────────────────────────────
   POST /api/subscribe
   Recibe: { email: string }
   Acción: envía el correo de confirmación al usuario con la plantilla
           email-confirmation.html, reemplazando {{EMAIL}} con el
           correo del inscrito.
   ────────────────────────────────────────────────────────────────── */
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Correo inválido.' });
  }

  /* Leer plantilla HTML */
  const templatePath = path.join(__dirname, 'email-confirmation.html');
  let html;
  try {
    html = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    console.error('[subscribe] No se pudo leer email-confirmation.html:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }

  /* Reemplazar marcador con el correo real */
  html = html.replace(/\{\{EMAIL\}\}/g, email);

  try {
    await transporter.sendMail({
      from:    `"ALTEC VAE" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to:      email,
      subject: 'ALTEC VAE — Confirmación de Inscripción',
      html,
    });

    console.log(`[subscribe] Correo de confirmación enviado a: ${email}`);
    return res.json({ ok: true });

  } catch (err) {
    console.error('[subscribe] Error enviando correo:', err);
    return res.status(500).json({ error: 'No se pudo enviar el correo.' });
  }
});

/* ──────────────────────────────────────────────────────────────────
   POST /api/survey
   Recibe: { email, nombre, region, comuna, telefono }
   Acción: genera un archivo Excel con los datos y lo envía como
           adjunto al EXCEL_RECIPIENT definido arriba.
   ────────────────────────────────────────────────────────────────── */
app.post('/api/survey', async (req, res) => {
  const { email, nombre, region, comuna, telefono } = req.body;

  /* Validación básica — todos los campos son obligatorios */
  if (!email || !nombre || !region || !comuna || !telefono) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  /* ── Generar Excel en memoria ── */
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Inscripción');

  /* Metadatos del archivo */
  workbook.creator  = 'ALTEC VAE';
  workbook.created  = new Date();

  /* Estilos reutilizables */
  const headerFill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FF1A1D1A' },   // charcoal
  };
  const headerFont = {
    name: 'Calibri', bold: true, color: { argb: 'FF62C462' }, size: 11,
  };
  const bodyFont = {
    name: 'Calibri', color: { argb: 'FFF0F4F0' }, size: 11,
  };
  const bodyFill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FF242824' },   // surface2
  };
  const border = {
    top:    { style: 'thin', color: { argb: 'FF2A3A2A' } },
    left:   { style: 'thin', color: { argb: 'FF2A3A2A' } },
    bottom: { style: 'thin', color: { argb: 'FF2A3A2A' } },
    right:  { style: 'thin', color: { argb: 'FF2A3A2A' } },
  };

  /* Fila de encabezados */
  const headers = ['Nombre', 'Correo', 'Región', 'Comuna', 'Número de Teléfono'];
  const headerRow = worksheet.addRow(headers);

  headerRow.eachCell((cell) => {
    cell.fill   = headerFill;
    cell.font   = headerFont;
    cell.border = border;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 22;

  /* Fila de datos */
  const dataRow = worksheet.addRow([nombre, email, region, comuna, telefono]);
  dataRow.eachCell((cell) => {
    cell.fill   = bodyFill;
    cell.font   = bodyFont;
    cell.border = border;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  dataRow.height = 20;

  /* Anchos de columna */
  worksheet.columns = [
    { key: 'A', width: 26 },   // Nombre
    { key: 'B', width: 34 },   // Correo
    { key: 'C', width: 22 },   // Región
    { key: 'D', width: 20 },   // Comuna
    { key: 'E', width: 22 },   // Teléfono
  ];

  /* Serializar a buffer */
  let excelBuffer;
  try {
    excelBuffer = await workbook.xlsx.writeBuffer();
  } catch (err) {
    console.error('[survey] Error generando Excel:', err);
    return res.status(500).json({ error: 'Error generando el Excel.' });
  }

  /* ── Nombre del archivo con timestamp ── */
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `inscripcion_${timestamp}.xlsx`;

  /* ── Enviar Excel por correo al destinatario configurado ── */
  try {
    await transporter.sendMail({
      from:    `"ALTEC VAE" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to:      EXCEL_RECIPIENT,           // ← definido en la constante de arriba
      subject: `Nueva inscripción de encuesta — ${nombre}`,
      html: `
        <div style="font-family:sans-serif;color:#333;padding:24px;">
          <h2 style="color:#2a7a2a;">Nueva Inscripción Recibida</h2>
          <p>Se ha recibido una nueva respuesta de encuesta. Los datos se adjuntan en el Excel.</p>
          <table style="border-collapse:collapse;margin-top:16px;">
            <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Nombre</td>
                <td style="padding:6px 12px;">${nombre}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Correo</td>
                <td style="padding:6px 12px;">${email}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Región</td>
                <td style="padding:6px 12px;">${region}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Comuna</td>
                <td style="padding:6px 12px;">${comuna}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;color:#555;">Teléfono</td>
                <td style="padding:6px 12px;">${telefono}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:0.85rem;color:#999;">
            Enviado automáticamente por ALTEC VAE — Inscripción de Encuesta
          </p>
        </div>
      `,
      attachments: [
        {
          filename,
          content:     excelBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    console.log(`[survey] Excel enviado a ${EXCEL_RECIPIENT} — inscrito: ${email}`);
    return res.json({ ok: true });

  } catch (err) {
    console.error('[survey] Error enviando correo con Excel:', err);
    return res.status(500).json({ error: 'No se pudo enviar el Excel.' });
  }
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║        ALTEC VAE — Servidor Encuesta         ║
╠══════════════════════════════════════════════╣
║  Puerto:  ${String(PORT).padEnd(34)}  ║
║  Excel →  ${EXCEL_RECIPIENT.slice(0,34).padEnd(34)}  ║
╚══════════════════════════════════════════════╝
  `);
});