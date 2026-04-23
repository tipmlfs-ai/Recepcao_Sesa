"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const exceljs_1 = __importDefault(require("exceljs"));
const PdfPrinter = require('pdfmake');
const date_fns_1 = require("date-fns");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
function translateStatus(status) {
    if (!status)
        return 'Indisponível';
    const s = status.toUpperCase();
    switch (s) {
        case 'WAITING': return 'Aguardando';
        case 'IN_WAITING_ROOM': return 'Na Sala de Espera';
        case 'IN_SERVICE': return 'Em Atendimento';
        case 'FINISHED': return 'Finalizado';
        case 'EXPIRED': return 'Expirado';
        case 'NO_SHOW': return 'Não Compareceu';
        default: return status;
    }
}
// Shared filtering logic
async function getFilteredVisits(req) {
    const { date, filterType, code, cpf, sectorId, ticketStatus } = req.query;
    let queryOptions = {
        include: {
            citizen: true,
            sector: true,
            user: { select: { email: true } }
        },
        orderBy: { timestamp: 'desc' },
        where: {}
    };
    if (sectorId) {
        queryOptions.where.sectorId = sectorId;
    }
    if (ticketStatus) {
        queryOptions.where.ticketStatus = ticketStatus;
    }
    if (code) {
        queryOptions.where.code = { contains: code, mode: 'insensitive' };
        return await prisma.visit.findMany(queryOptions);
    }
    if (cpf) {
        queryOptions.where.citizenId = { contains: cpf };
        return await prisma.visit.findMany(queryOptions);
    }
    if (filterType) {
        let startDate;
        let endDate;
        if (filterType === 'custom') {
            const customStart = req.query.startDate;
            const customEnd = req.query.endDate;
            if (customStart && customEnd) {
                startDate = new Date(customStart + 'T00:00:00-03:00');
                endDate = new Date(customEnd + 'T23:59:59.999-03:00');
            }
            else {
                startDate = new Date();
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date();
                endDate.setHours(23, 59, 59, 999);
            }
        }
        else {
            const targetDate = date ? new Date(date) : new Date();
            startDate = new Date(targetDate);
            endDate = new Date(targetDate);
            if (filterType === 'day') {
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            }
            else if (filterType === 'week') {
                const day = startDate.getDay();
                startDate.setDate(startDate.getDate() - day);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() + (6 - day));
                endDate.setHours(23, 59, 59, 999);
            }
            else if (filterType === 'month') {
                startDate.setDate(1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(0);
                endDate.setHours(23, 59, 59, 999);
            }
        }
        queryOptions.where.timestamp = { gte: startDate, lte: endDate };
    }
    else if (!code && !cpf && !ticketStatus) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        queryOptions.where.timestamp = { gte: todayStart, lte: todayEnd };
    }
    return await prisma.visit.findMany(queryOptions);
}
// XLSX Inteligente
router.get('/xlsx', async (req, res) => {
    try {
        const visits = await getFilteredVisits(req);
        const sectorName = req.query.sectorId ? visits[0]?.sector?.name || 'Setor' : 'Visão Geral';
        const workbook = new exceljs_1.default.Workbook();
        workbook.creator = 'Recepção SESA';
        workbook.created = new Date();
        // Aba 1: Dashboard Summary
        const summarySheet = workbook.addWorksheet('Dashboard Summary');
        summarySheet.columns = [
            { header: 'Métrica', key: 'metric', width: 30 },
            { header: 'Valor', key: 'value', width: 20 }
        ];
        const totalVisits = visits.length;
        const finished = visits.filter((v) => v.ticketStatus === 'FINISHED').length;
        const noShow = visits.filter((v) => v.ticketStatus === 'NO_SHOW').length;
        const waiting = visits.filter((v) => v.ticketStatus === 'WAITING').length;
        const inService = visits.filter((v) => v.ticketStatus === 'IN_SERVICE').length;
        summarySheet.addRows([
            { metric: 'Setor Analisado', value: sectorName },
            { metric: 'Total de Atendimentos', value: totalVisits },
            { metric: 'Finalizados', value: finished },
            { metric: 'Não Compareceu', value: noShow },
            { metric: 'Aguardando', value: waiting },
            { metric: 'Em Atendimento', value: inService },
            { metric: 'Data de Geração', value: (0, date_fns_1.format)(new Date(), 'dd/MM/yyyy HH:mm') }
        ]);
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        summarySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
        // Aba 2: Raw Data
        const rawSheet = workbook.addWorksheet('Raw Data', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
        rawSheet.columns = [
            { header: 'Entrada', key: 'timestamp', width: 20 },
            { header: 'Atendido em', key: 'finishedAt', width: 20 },
            { header: 'Ticket', key: 'code', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Cidadão', key: 'citizenName', width: 30 },
            { header: 'CPF', key: 'citizenCpf', width: 20 },
            { header: 'Setor', key: 'sectorName', width: 25 },
            { header: 'Atendente', key: 'userEmail', width: 30 }
        ];
        rawSheet.getRow(1).font = { bold: true };
        rawSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        rawSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
        rawSheet.autoFilter = 'A1:G1';
        visits.forEach((v) => {
            // Adjust to UTC-3 for display
            const adjustDate = (d) => {
                if (!d)
                    return null;
                return new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000);
            };
            const row = rawSheet.addRow({
                timestamp: adjustDate(v.timestamp),
                finishedAt: (v.finishedAt && v.ticketStatus !== 'NO_SHOW') ? adjustDate(v.finishedAt) : null,
                code: v.code,
                status: translateStatus(v.ticketStatus),
                citizenName: v.citizen?.name,
                citizenCpf: v.citizenId,
                sectorName: v.sector?.name,
                userEmail: v.user?.email || '-'
            });
            // formatting timestamp columns as native excel dates
            row.getCell('timestamp').numFmt = 'dd/mm/yyyy hh:mm';
            row.getCell('finishedAt').numFmt = 'dd/mm/yyyy hh:mm';
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Relatorio_${sectorName.replace(/\s/g, '_')}_${(0, date_fns_1.format)(new Date(), 'yyyyMMdd')}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    }
    catch (error) {
        console.error('XLSX Export Error:', error);
        res.status(500).json({ error: 'Falha ao exportar planilha' });
    }
});
// PDF Premium
// PDF Premium via Puppeteer Serverless
router.get('/pdf', async (req, res) => {
    let browser = null;
    try {
        console.log(`[PDF Export] Início da geração do PDF para a query:`, req.query);
        let visits;
        try {
            visits = await getFilteredVisits(req);
        }
        catch (dbErr) {
            console.error(`[PDF Export] Erro ocorrido na busca do Banco de Dados:`, dbErr.message);
            return res.status(500).json({ error: 'Falha ao buscar dados no banco', details: dbErr.message });
        }
        if (!visits || visits.length === 0) {
            console.warn(`[PDF Export] Nenhum dado retornado para a query informada.`);
            return res.status(404).json({ error: 'Nenhum dado encontrado com os filtros informados.' });
        }
        const sectorName = req.query.sectorId ? visits[0]?.sector?.name || 'Setor' : 'Visão Geral';
        const finishedCount = visits.filter((v) => v.ticketStatus === 'FINISHED').length;
        const noShowCount = visits.filter((v) => v.ticketStatus === 'NO_SHOW').length;
        const waitingCount = visits.filter((v) => v.ticketStatus === 'WAITING').length;
        let tableRowsHtml = '';
        visits.forEach((v) => {
            const adjustTZ = (d) => d ? new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000) : null;
            const displayEntry = v.timestamp ? (0, date_fns_1.format)(adjustTZ(v.timestamp), 'dd/MM/yyyy HH:mm') : '-';
            const displayExit = (v.finishedAt && v.ticketStatus !== 'NO_SHOW') ? (0, date_fns_1.format)(adjustTZ(v.finishedAt), 'dd/MM/yyyy HH:mm') : '-';
            tableRowsHtml += `
                <tr>
                    <td>${displayEntry}</td>
                    <td>${displayExit}</td>
                    <td>${v.code || '-'}</td>
                    <td>${translateStatus(v.ticketStatus)}</td>
                    <td>${v.citizen?.name || 'Anônimo'}</td>
                    <td>${v.sector?.name || 'Geral'}</td>
                </tr>
            `;
        });
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 12px; }
                .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
                .title { font-size: 20px; font-weight: bold; }
                .subtitle { font-size: 14px; color: #475569; margin-top: 5px; text-align: right; }
                .kpi-row { display: flex; gap: 20px; margin-bottom: 20px; }
                .kpi-card { background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-weight: bold; font-size: 12px; flex: 1; }
                .kpi-value { font-size: 18px; color: #334155; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #0f172a; color: white; padding: 10px; text-align: left; font-size: 11px; }
                td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
                tr:nth-child(even) { background-color: #f8fafc; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Recepção SESA</div>
                <div class="subtitle">Relatório: ${sectorName}</div>
            </div>

            <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Resumo do Dashboard</div>
            <div class="kpi-row">
                <div class="kpi-card">Total de Atendimentos<div class="kpi-value">${visits.length}</div></div>
                <div class="kpi-card">Finalizados<div class="kpi-value">${finishedCount}</div></div>
                <div class="kpi-card">Não Compareceu<div class="kpi-value">${noShowCount}</div></div>
                <div class="kpi-card">Aguardando<div class="kpi-value">${waitingCount}</div></div>
            </div>

            <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Dados Brutos</div>
            <table>
                <thead>
                    <tr>
                        <th>Entrada</th>
                        <th>Atendido em</th>
                        <th>Ticket</th>
                        <th>Status</th>
                        <th>Cidadão</th>
                        <th>Setor</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
        </body>
        </html>
        `;
        const chromium = require('@sparticuz/chromium');
        const puppeteer = require('puppeteer-core');
        console.log('[PDF Export] Inicializando Puppeteer com @sparticuz/chromium...');
        // Em ambiente local (Windows), o fallback resolve para o Chrome instalado.
        const executablePath = process.env.VERCEL ? await chromium.executablePath() : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        let footerDate = '';
        try {
            footerDate = (0, date_fns_1.format)(new Date(), 'dd/MM/yyyy HH:mm');
        }
        catch (e) {
            footerDate = 'Data Indisponível';
        }
        console.log('[PDF Export] Gerando PDF buffer...');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: '40px', right: '40px', bottom: '60px', left: '40px' },
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="width: 100%; font-size: 8px; color: #64748b; padding: 0 40px; display: flex; justify-content: space-between; font-family: Helvetica, Arial, sans-serif;">
                    <span>Gerado em: ${footerDate} | Filtro Aplicado</span>
                    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
                </div>
            `
        });
        let safeSectorName = sectorName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        let fileDate = '';
        try {
            fileDate = (0, date_fns_1.format)(new Date(), 'yyyyMMdd');
        }
        catch (e) {
            fileDate = 'Export';
        }
        console.log('[PDF Export] Buffer gerado com sucesso. Enviando cliente...');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Relatorio_${safeSectorName}_${fileDate}.pdf`);
        res.end(pdfBuffer);
    }
    catch (error) {
        console.error('[PDF Export - FATAL]', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Falha interna ao exportar PDF via Puppeteer Serverless',
                message: process.env.NODE_ENV === 'development' ? error.stack : error.message
            });
        }
    }
    finally {
        if (browser !== null) {
            await browser.close().catch(console.error);
        }
    }
});
// --- PDF Export for Entry Logs (Caderno de Entrada) ---
router.get('/entry-logs/pdf', async (req, res) => {
    let browser = null;
    try {
        const { date, filterType, startDate, endDate, sectorId, cpf } = req.query;
        let queryOptions = {
            include: { sector: true },
            orderBy: { timestamp: 'desc' },
            where: {}
        };
        if (sectorId)
            queryOptions.where.sectorId = sectorId;
        if (cpf)
            queryOptions.where.cpf = { contains: cpf };
        if (filterType) {
            let sDate;
            let eDate;
            if (filterType === 'custom') {
                if (startDate && endDate) {
                    sDate = new Date(startDate + 'T00:00:00-03:00');
                    eDate = new Date(endDate + 'T23:59:59.999-03:00');
                }
                else {
                    sDate = new Date();
                    sDate.setHours(0, 0, 0, 0);
                    eDate = new Date();
                    eDate.setHours(23, 59, 59, 999);
                }
            }
            else {
                const targetDate = date ? new Date(date) : new Date();
                sDate = new Date(targetDate);
                eDate = new Date(targetDate);
                if (filterType === 'day') {
                    sDate.setHours(0, 0, 0, 0);
                    eDate.setHours(23, 59, 59, 999);
                }
                else if (filterType === 'week') {
                    const day = sDate.getDay();
                    sDate.setDate(sDate.getDate() - day);
                    sDate.setHours(0, 0, 0, 0);
                    eDate.setDate(eDate.getDate() + (6 - day));
                    eDate.setHours(23, 59, 59, 999);
                }
                else if (filterType === 'month') {
                    sDate.setDate(1);
                    sDate.setHours(0, 0, 0, 0);
                    eDate.setMonth(eDate.getMonth() + 1);
                    eDate.setDate(0);
                    eDate.setHours(23, 59, 59, 999);
                }
            }
            queryOptions.where.timestamp = { gte: sDate, lte: eDate };
        }
        else if (!cpf) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            queryOptions.where.timestamp = { gte: todayStart, lte: todayEnd };
        }
        const logs = await prisma.entryLog.findMany(queryOptions);
        if (!logs || logs.length === 0) {
            return res.status(404).json({ error: 'Nenhum registro encontrado para exportar.' });
        }
        let tableRowsHtml = '';
        logs.forEach((log) => {
            const adjustTZ = (d) => d ? new Date(new Date(d).getTime() - 3 * 60 * 60 * 1000) : null;
            const displayEntry = log.timestamp ? (0, date_fns_1.format)(adjustTZ(log.timestamp), 'dd/MM/yyyy HH:mm') : '-';
            tableRowsHtml += `
                <tr>
                    <td>${displayEntry}</td>
                    <td>${log.name}</td>
                    <td>${log.cpf}</td>
                    <td>${log.sector?.name || 'Geral'}</td>
                </tr>
            `;
        });
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 12px; }
                .header { display: flex; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-bottom: 20px; }
                .title { font-size: 20px; font-weight: bold; color: #064e3b; }
                .subtitle { font-size: 14px; color: #047857; margin-top: 5px; text-align: right; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background: #064e3b; color: white; padding: 10px; text-align: left; font-size: 11px; }
                td { padding: 8px 10px; border-bottom: 1px solid #d1fae5; font-size: 10px; }
                tr:nth-child(even) { background-color: #f0fdf4; }
                .total-card { margin-bottom: 20px; font-size: 14px; font-weight: bold; color: #064e3b; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Recepção SESA - Caderno de Entrada</div>
                <div class="subtitle">Relatório de Registros</div>
            </div>

            <div class="total-card">Total de Registros no Período: ${logs.length}</div>

            <table>
                <thead>
                    <tr>
                        <th>Horário de Entrada</th>
                        <th>Cidadão</th>
                        <th>CPF</th>
                        <th>Setor de Destino</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
        </body>
        </html>
        `;
        const chromium = require('@sparticuz/chromium');
        const puppeteer = require('puppeteer-core');
        const executablePath = process.env.VERCEL ? await chromium.executablePath() : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        let footerDate = '';
        try {
            footerDate = (0, date_fns_1.format)(new Date(), 'dd/MM/yyyy HH:mm');
        }
        catch (e) {
            footerDate = 'Data Indisponível';
        }
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: false,
            printBackground: true,
            margin: { top: '40px', right: '40px', bottom: '60px', left: '40px' },
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="width: 100%; font-size: 8px; color: #047857; padding: 0 40px; display: flex; justify-content: space-between; font-family: Helvetica, Arial, sans-serif;">
                    <span>Gerado em: ${footerDate}</span>
                    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
                </div>
            `
        });
        let fileDate = '';
        try {
            fileDate = (0, date_fns_1.format)(new Date(), 'yyyyMMdd');
        }
        catch (e) {
            fileDate = 'Export';
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=CadernoEntrada_${fileDate}.pdf`);
        res.end(pdfBuffer);
    }
    catch (error) {
        console.error('[PDF Export EntryLog - FATAL]', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Falha ao exportar PDF' });
        }
    }
    finally {
        if (browser !== null) {
            await browser.close().catch(console.error);
        }
    }
});
exports.default = router;
