// ==UserScript==
// @name         Navegação por Teclado - AnimeAllStar (Híbrido + Lista Inteligente)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Navega por capítulos com lista de links possíveis e ESC para cancelar
// @author       Você
// @match        https://animeallstar30.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict'

    let isModalActive = false
    let currentModalElements = { overlay: null, container: null, list: null }
    let currentKeyHandler = null
    let selectedIndex = 0
    let possibleLinks = []
    let debounceTimer = null
    let lastKeyPress = 0
    const KEY_DEBOUNCE_MS = 150

    // === FUNÇÃO PRINCIPAL: Analisa URL e gera links possíveis ===
    function getCandidates(url, direction) {
        const segments = parseURL(url)
        const matches = extractNumbers(segments)

        if (matches.length === 0) return null

        const candidates = generateCandidates(matches, segments, direction)
        const unique = deduplicateCandidates(candidates)

        return rankCandidates(unique)
    }

    // === ETAPA 1: parse da URL ===
    function parseURL(url) {
        const pathname = new URL(url).pathname
        return pathname.split('/').filter(Boolean)
    }

    // === ETAPA 2: extrair números com contexto ===
    function extractNumbers(segments) {
        const matches = []

        segments.forEach(segment => {
            const numbers = [...segment.matchAll(/(\d+)/g)]

            numbers.forEach(match => {
                const value = parseInt(match[1])
                const position = match.index
                const fullMatch = match[0]

                matches.push({
                    value,
                    segment,
                    position,
                    prefix: segment.substring(0, position),
                    suffix: segment.substring(position + fullMatch.length)
                })
            })
        })

        return matches
    }

    // === ETAPA 3: gerar candidatos ===
    function generateCandidates(matches, segments, direction) {
        const candidates = []

        matches.forEach(match => {
            const isPart = /parte?/i.test(match.segment)

            // anterior
            if (direction === 'prev' && match.value > 1) {
                candidates.push(buildCandidate(match, segments, match.value - 1, isPart ? 'parte anterior' : 'capítulo anterior'))
            }

            // próximo
            if (direction === 'next') {
                candidates.push(buildCandidate(match, segments, match.value + 1, isPart ? 'próxima parte' : 'próximo capítulo'))
            }
        })

        return candidates
    }

    // helper de construção
    function buildCandidate(match, segments, newValue, type) {
        const newSegment = match.prefix + newValue + match.suffix

        const newSegments = segments.map(seg =>
            seg === match.segment ? newSegment : seg
        )

        return {
            url: window.location.origin + '/' + newSegments.join('/'),
            type,
            originalNumber: match.value,
            newNumber: newValue,
            context: match.segment
        }
    }

    // === ETAPA 4: remover duplicatas ===
    function deduplicateCandidates(candidates) {
        const seen = new Set()
        return candidates.filter(c => {
            if (seen.has(c.url)) return false
            seen.add(c.url)
            return true
        })
    }

    // === ETAPA 5: ranking ===
    function rankCandidates(candidates) {
        return candidates
            .map(c => ({
                ...c,
                score: scoreCandidate(c)
            }))
            .sort((a, b) => b.score - a.score)
    }

    // heurística de score
    function scoreCandidate(candidate) {
        let score = 0

        const context = candidate.context.toLowerCase()

        if (context.includes('chapter')) score += 10
        if (context.includes('cap')) score += 8
        if (context.includes('parte')) score += 6

        // evita números absurdos
        if (candidate.originalNumber < 10000) score += 2

        // bônus leve por proximidade natural
        if (Math.abs(candidate.newNumber - candidate.originalNumber) === 1) {
            score += 1
        }

        return score
    }

    // === FUNÇÃO PARA EXTRAIR CAPÍTULO ATUAL (sem fallback problemático) ===
    function getCurrentChapter() {
        const element = document.querySelector(".nav-previous p")
        if (element) {
            const match = element.textContent.match(/Chapter\s+(\d+)/i)
            if (match) return parseInt(match[1])
        }

        // Fallback: tenta extrair números do contexto sem assumir qual é o capítulo
        const url = window.location.href
        const numberMatches = [...url.matchAll(/(\d+)/g)].map(m => parseInt(m[1]))

        if (numberMatches.length === 0) return null

        // Prioriza números que não parecem ser IDs ou anos
        const likelyChapter = numberMatches.find(n => n > 0 && n < 10000 && n !== 2024 && n !== 2025)

        console.log("[Capítulo] Detectado via fallback:", likelyChapter)
        return likelyChapter || numberMatches[0]
    }

    // === REMOVER MODAL ===
    function removeModal() {
        if (currentModalElements.overlay?.parentNode) currentModalElements.overlay.remove()
        if (currentModalElements.container?.parentNode) currentModalElements.container.remove()

        if (currentKeyHandler) {
            document.removeEventListener('keydown', currentKeyHandler)
            currentKeyHandler = null
        }

        currentModalElements = { overlay: null, container: null, list: null }
        isModalActive = false
        possibleLinks = []
        selectedIndex = 0

        console.log("[Modal] Fechado")
    }

    // === NAVEGAR PARA LINK SELECIONADO ===
    function navigateToSelectedLink() {
        if (possibleLinks[selectedIndex]) {
            console.log("[Navegação] Redirecionando para:", possibleLinks[selectedIndex].url)
            window.location.href = possibleLinks[selectedIndex].url
        }
    }

    // === MENSAGEM TEMPORÁRIA ===
    function showTemporaryMessage(msg, duration = 2500) {
        const toast = document.createElement("div")
        toast.textContent = msg
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #111;
            color: #ffaa44;
            padding: 12px 20px;
            border-radius: 30px;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            border-left: 5px solid #ff5722;
            font-size: 14px;
            animation: slideIn 0.2s ease;
        `

        const style = document.createElement('style')
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `
        if (!document.querySelector('#toast-style')) {
            style.id = 'toast-style'
            document.head.appendChild(style)
        }

        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), duration)
    }

    // === CRIAR MODAL COM LISTA DE LINKS ===
    function createLinkListModal(direction, links) {
        removeModal()

        if (!links || links.length === 0) {
            showTemporaryMessage("❌ Nenhum link possível encontrado")
            return false
        }

        possibleLinks = links
        selectedIndex = 0

        const overlay = document.createElement("div")
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 9998;
            backdrop-filter: blur(8px);
            animation: fadeIn 0.2s ease;
        `

        const container = document.createElement("div")
        container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            z-index: 9999;
            min-width: 400px;
            max-width: 600px;
            max-height: 70vh;
            overflow-y: auto;
            border: 2px solid #ff5722;
            animation: slideUp 0.3s ease;
        `

        // Header
        const header = document.createElement("div")
        header.style.cssText = `
            padding: 20px 25px;
            border-bottom: 1px solid rgba(255, 87, 34, 0.3);
            background: rgba(0,0,0,0.3);
        `

        const title = document.createElement("h3")
        title.textContent = direction === 'prev' ? '⬅️ Navegar para capítulo anterior' : '➡️ Navegar para próximo capítulo'
        title.style.cssText = `
            margin: 0 0 5px 0;
            color: #ff5722;
            font-family: system-ui, sans-serif;
        `

        const subtitle = document.createElement("p")
        subtitle.textContent = `↑ ↓ para navegar • ENTER para confirmar • ESC para cancelar`
        subtitle.style.cssText = `
            margin: 0;
            font-size: 12px;
            color: #aaa;
            font-family: system-ui, sans-serif;
        `

        header.appendChild(title)
        header.appendChild(subtitle)

        // Lista de links
        const listContainer = document.createElement("div")
        listContainer.style.cssText = `
            padding: 10px 0;
        `

        function renderList() {
            listContainer.innerHTML = ''
            possibleLinks.forEach((link, idx) => {
                const item = document.createElement("div")
                item.style.cssText = `
                    padding: 12px 25px;
                    margin: 5px 15px;
                    background: ${idx === selectedIndex ? '#ff5722' : 'rgba(255, 255, 255, 0.05)'};
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    color: ${idx === selectedIndex ? '#fff' : '#ddd'};
                    font-family: monospace;
                    font-size: 13px;
                    border-left: 3px solid ${idx === selectedIndex ? '#fff' : '#ff5722'};
                `

                // Mostra contexto do link
                const linkType = link.type || 'link'
                const preview = link.url.length > 80 ? link.url.substring(0, 77) + '...' : link.url

                item.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 5px;">📌 ${linkType}: ${link.newNumber}</div>
                    <div style="font-size: 11px; opacity: 0.7; word-break: break-all;">${preview}</div>
                    ${link.context ? `<div style="font-size: 10px; opacity: 0.5; margin-top: 3px;">Contexto: ${link.context}</div>` : ''}
                `

                item.onmouseenter = () => {
                    selectedIndex = idx
                    renderList()
                }

                item.onclick = () => {
                    window.location.href = link.url
                }

                listContainer.appendChild(item)
            })
        }

        renderList()
        container.appendChild(header)
        container.appendChild(listContainer)

        // Footer com hint
        const footer = document.createElement("div")
        footer.style.cssText = `
            padding: 15px 25px;
            border-top: 1px solid rgba(255, 87, 34, 0.3);
            font-size: 11px;
            color: #888;
            text-align: center;
        `
        footer.textContent = "💡 Dica: Use as setas e ENTER para navegar - o script tenta adivinhar a estrutura da URL"
        container.appendChild(footer)

        document.body.appendChild(overlay)
        document.body.appendChild(container)

        currentModalElements = { overlay, container, list: listContainer }
        isModalActive = true

        // Handler de teclado para o modal
        const keyHandler = (event) => {
            if (!isModalActive) return

            event.preventDefault()
            event.stopPropagation()

            const now = Date.now()
            if (now - lastKeyPress < KEY_DEBOUNCE_MS) return
            lastKeyPress = now

            if (event.key === 'ArrowUp') {
                selectedIndex = (selectedIndex - 1 + possibleLinks.length) % possibleLinks.length
                renderList()
                // Scroll para o item selecionado
                const selectedItem = listContainer.children[selectedIndex]
                if (selectedItem) selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
            else if (event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % possibleLinks.length
                renderList()
                const selectedItem = listContainer.children[selectedIndex]
                if (selectedItem) selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
            else if (event.key === 'Enter') {
                navigateToSelectedLink()
            }
            else if (event.key === 'Escape' || event.key === 'Esc') {
                removeModal()
                showTemporaryMessage("❌ Navegação cancelada", 1500)
            }
        }

        document.addEventListener('keydown', keyHandler)
        currentKeyHandler = keyHandler

        // Timeout automático
        setTimeout(() => {
            if (isModalActive) {
                removeModal()
                showTemporaryMessage("⏰ Tempo esgotado", 1500)
            }
        }, 15000)

        return true
    }

    // === HANDLER PRINCIPAL (COM DEBOUNCE) ===
    function onKeyDown(event) {
        if (isModalActive) return

        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

        // Previne apenas teclas específicas que usamos
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            // Verifica se não está em campo de input
            const activeTag = document.activeElement.tagName
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement.isContentEditable) {
                return
            }

            event.preventDefault()

            // Debounce para evitar múltiplos modais
            if (debounceTimer) clearTimeout(debounceTimer)

            debounceTimer = setTimeout(() => {
                const direction = event.key === 'ArrowLeft' ? 'prev' : 'next'
                const currentChapter = getCurrentChapter()

                if (!currentChapter) {
                    showTemporaryMessage("❌ Não foi possível detectar o capítulo atual")
                    return
                }

                console.log(`[Navegação] Direção: ${direction}, Capítulo atual: ${currentChapter}`)

                // Gera links possíveis
                const links = getCandidates(window.location.href, direction)

                if (!links || links.length === 0) {
                    showTemporaryMessage(`⚠️ Não foi possível gerar links para o ${direction === 'prev' ? 'capítulo anterior' : 'próximo capítulo'}`)
                    return
                }

                console.log(`[Links] ${links.length} link(s) possível(is):`, links)
                createLinkListModal(direction === 'prev' ? 'prev' : 'next', links)

                debounceTimer = null
            }, 50)
        }
    }

    // === INICIALIZAÇÃO ===
    function init() {
        console.log("✅ Script v4.0 ativo - Navegação com lista inteligente")

        // Adiciona estilos globais
        const style = document.createElement('style')
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translate(-50%, -40%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `
        document.head.appendChild(style)

        const chapter = getCurrentChapter()
        if (chapter) console.log(`📖 Capítulo atual: ${chapter}`)
        else console.warn("⚠️ Não foi possível detectar o capítulo atual")

        document.addEventListener('keydown', onKeyDown)
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        init()
    }
})()
