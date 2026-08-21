/**
 * graph.js - Cytoscape graph visualization
 * Handles graph initialization, rendering, and interactions
 */

const GraphManager = {
    cy: null,
    fullGraph: null,
    activeLayout: null,
    activeLayoutWorker: null,
    pendingLayoutStart: null,
    layoutRunId: 0,
    canceledLayoutRunId: null,
    selectedLayoutEngine: 'dagre',
    dagreRegistered: false,
    fcoseRegistered: false,
    elkRegistered: false,
    graphName: '',
    hideGenEventNodes: true,
    hideSimVertexKey0Node: true,
    hidePartonShower: false,
    hideSmallDisconnectedSubgraphs: true,
    smallDisconnectedSubgraphNodeLimit: 10,
    nodeTypeColors: {
        gen: '#c1daf3',
        sim: '#e4b892',
        genSim: '#2ecc71',
        event: '#c79f00'
    },

    // The logical truth graph is standalone: a node is described by its own truth
    // level, its hit footprint and its role, not by GEN or SIM provenance.
    // Fill colour carries the dominant truth level, most signal-like first.
    truthLevelColors: {
        hardProcess: '#bd1f01',
        partonJets: '#e76300',
        reconstructableFromSignal: '#832db6',
        stableLegsFromUpstream: '#3f90da',
        stableDecayProducts: '#92dadd',
        caloBoundary: '#b9ac70',
        underlyingEvent: '#94a4a2',
        none: '#e8e8e8'
    },
    truthLevelDarkFills: new Set([
        '#bd1f01', '#e76300', '#832db6', '#3f90da', '#a96b59'
    ]),
    truthVertexColor: '#d9d9d9',
    truthArtificialColors: {
        interaction: '#ffa90e',
        upstream: '#a96b59',
        underlyingEvent: '#94a4a2'
    },
    truthArtificialShapes: {
        interaction: 'star',
        upstream: 'pentagon',
        underlyingEvent: 'round-rectangle'
    },
    // Border width carries the hit footprint. No hits is drawn dashed.
    truthFootprintBorderWidths: {
        caloRec: 5,
        caloSim: 3,
        tracker: 2,
        none: 1
    },
    truthMarkerColors: {
        backscattered: '#e76300',
        checkpoints: '#009988',
        plain: '#34495e'
    },
    truthArtificialNodeSize: 64,
    defaultNodeSize: 58,
    vertexNodeSize: 30,
    eventNodeSize: 88,
    statusOneNodeSizeMultiplier: 1.1,
    statusOneNodeColor: '#ff9589',
    smallParticlePdgIds: new Set([22, 11, -11]),

    // The truth-graph DOT dumper encodes the role of a node in its Graphviz shape.
    // Map those onto the Cytoscape shape vocabulary so the producer's intent shows
    // through (seed, muon, and the four vertex kinds are immediately recognisable).
    gvShapeToCytoscape: {
        doublecircle: 'ellipse',    // selection seed (rendered with a gold double ring)
        circle: 'ellipse',
        ellipse: 'ellipse',         // particle leaving tracker/calo hits
        oval: 'ellipse',
        hexagon: 'hexagon',         // muon
        diamond: 'diamond',         // decay / production vertex
        box: 'round-rectangle',     // underlying-event vertex
        rect: 'round-rectangle',
        rectangle: 'round-rectangle',
        house: 'pentagon',          // ISR / upstream vertex
        doubleoctagon: 'octagon',   // hard-interaction vertex
        octagon: 'octagon',
        star: 'star',
    },

    // Graphviz uses X11 colour names, several of them numbered variants
    // (darkseagreen1, goldenrod4, red2, gray20, ...) that are NOT valid CSS and
    // would render as black/transparent in the browser. Translate the ones the
    // truth-graph dumper emits to the exact hex graphviz itself uses, so the
    // interactive view matches the static SVGs. Plain CSS names pass through.
    gvColors: {
        aliceblue: '#f0f8ff', blue: '#0000ff', darkgreen: '#006400',
        darkorange3: '#cd6600', darkseagreen1: '#c1ffc1', deepskyblue: '#00bfff',
        firebrick4: '#8b1a1a', gold: '#ffd700', goldenrod4: '#8b6914',
        gray20: '#333333', gray45: '#737373', gray50: '#7f7f7f', gray55: '#8c8c8c',
        gray65: '#a6a6a6', gray75: '#bfbfbf', gray85: '#d9d9d9', gray92: '#ebebeb',
        indianred1: '#ff6a6a', khaki: '#f0e68c', lightblue: '#add8e6',
        lightskyblue: '#87cefa', mediumpurple1: '#ab82ff', navajowhite: '#ffdead',
        navy: '#000080', orangered3: '#cd3700', purple: '#a020f0', red2: '#ee0000',
        royalblue: '#4169e1', salmon: '#fa8072', sienna1: '#ff8247',
        skyblue: '#87ceeb', violetred1: '#ff3e96', white: '#ffffff',
    },

    // Translate a Graphviz colour token to a browser-safe colour: pass through
    // hex (#rrggbb) and CSS names, map known X11 names, fall back to the input.
    gvColor(name) {
        if (name === undefined || name === null) return null;
        const raw = String(name).trim();
        if (!raw) return null;
        if (raw.charAt(0) === '#') return raw;
        return this.gvColors[raw.toLowerCase()] || raw;
    },

    htmlLabelToCanvasText(value) {
        const superscriptChars = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
            '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
            'n': 'ⁿ', 'i': 'ⁱ'
        };
        const subscriptChars = {
            '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
            '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
            '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎'
        };

        const convertText = (text, replacements) => Array.from(text)
            .map(character => replacements[character] || character)
            .join('');

        const template = document.createElement('template');
        template.innerHTML = String(value);

        const nodeToText = (node, replacements = null) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return replacements ? convertText(node.textContent, replacements) : node.textContent;
            }

            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
                return '';
            }

            const tagName = node.nodeType === Node.ELEMENT_NODE ? node.tagName.toUpperCase() : '';
            const childReplacements = tagName === 'SUP'
                ? superscriptChars
                : tagName === 'SUB'
                    ? subscriptChars
                    : replacements;

            return Array.from(node.childNodes)
                .map(child => nodeToText(child, childReplacements))
                .join('');
        };

        return nodeToText(template.content);
    },

    getNodeKind(ele) {
        const explicitType = String(ele.data('type') || '').trim();
        if (explicitType) return explicitType;

        if (!this.isLogicalGraph()) return '';

        const logicalFlags = this.getLogicalFlags(ele);
        const isVertex = this.isLogicalVertex(ele);

        if (logicalFlags.hasGen && logicalFlags.hasSim) {
            return isVertex ? 'GenSimVertex' : 'GenSimParticle';
        }
        if (logicalFlags.hasGen) {
            return isVertex ? 'GenVertex' : 'GenParticle';
        }
        if (logicalFlags.hasSim) {
            return isVertex ? 'SimVertex' : 'SimTrack';
        }

        return isVertex ? 'LogicalVertex' : 'LogicalParticle';
    },

    isLogicalGraph() {
        return this.graphName === 'TruthLogicalGraph';
    },

    // A node carries a truth classification when the preprocessing recognised the
    // logical graph. Graphs without it keep the legacy GEN/SIM styling.
    truthKind(ele) {
        return String(ele.data('truthKind') || '').trim();
    },

    hasTruthClassification(ele) {
        return this.truthKind(ele) !== '';
    },

    truthLevel(ele) {
        const level = String(ele.data('truthLevel') || '').trim();
        return level || 'none';
    },

    truthFootprint(ele) {
        return String(ele.data('truthFootprint') || 'none').trim();
    },

    truthRole(ele) {
        return String(ele.data('truthRole') || '').trim();
    },

    isTruthRoot(ele) {
        return String(ele.data('isRoot') || '').trim() === '1';
    },

    isBackscattered(ele) {
        return String(ele.data('backscattered') || '').trim() === '1';
    },

    hasCheckpoints(ele) {
        const count = Number.parseInt(ele.data('nCheckpoints'), 10);
        return Number.isFinite(count) && count > 0;
    },

    isTruthyAttribute(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0 || value === null || value === undefined) return false;

        const normalized = String(value).trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    },

    extractLogicalFlagFromText(ele, key) {
        const text = `${ele.data('rawLabel') || ''}\n${ele.data('detailLabel') || ''}`;
        const match = text.match(new RegExp(`${key}\\s*:\\s*(yes|no|true|false|1|0)`, 'i'));
        return match ? this.isTruthyAttribute(match[1]) : false;
    },

    getLogicalFlags(ele) {
        const hasGenAttribute = ele.data('hasGen');
        const hasSimAttribute = ele.data('hasSim');

        let hasGen = hasGenAttribute !== undefined
            ? this.isTruthyAttribute(hasGenAttribute)
            : this.extractLogicalFlagFromText(ele, 'hasGen');
        let hasSim = hasSimAttribute !== undefined
            ? this.isTruthyAttribute(hasSimAttribute)
            : this.extractLogicalFlagFromText(ele, 'hasSim');

        if (!hasGen && !hasSim) {
            const domainText = `${ele.data('rawLabel') || ''}\n${ele.data('detailLabel') || ''}`;
            if (/domain\s*:\s*GEN/i.test(domainText)) hasGen = true;
            if (/domain\s*:\s*SIM/i.test(domainText)) hasSim = true;
        }

        return { hasGen, hasSim };
    },

    isLogicalGenSimNode(ele) {
        if (!this.isLogicalGraph()) return false;

        const logicalFlags = this.getLogicalFlags(ele);
        return logicalFlags.hasGen && logicalFlags.hasSim;
    },

    isLogicalVertex(ele) {
        const shape = String(ele.data('shape') || '').trim();
        return shape === 'diamond' || /^v\d+$/.test(ele.id());
    },

    getParticlePdgId(ele) {
        const rawParticleId = ele.data('pdgId') ?? ele.data('pdgid') ?? ele.data('pid') ?? ele.data('pdg');
        const particleId = Number.parseInt(rawParticleId, 10);
        return Number.isFinite(particleId) ? particleId : null;
    },

    isParticleNode(ele) {
        const type = this.getNodeKind(ele);
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle') return true;

        const particleId = this.getParticlePdgId(ele);
        if (particleId !== null && particleId !== 0) return true;

        const shape = String(ele.data('shape') || '').trim();
        return shape === 'ellipse' || /^p\d+$/.test(ele.id());
    },

    getCompactLabelFromData(data) {
        // A truth-classified node carries its own two-line label: the title, which
        // is the particle name or the vertex reason, and a short second line.
        if (data.truthKind) {
            const title = this.htmlLabelToCanvasText(data.truthTitle || data.id);
            return data.truthSubtitle ? `${title}\n${data.truthSubtitle}` : title;
        }

        const dataAccessor = {
            id: () => data.id,
            data: key => data[key]
        };

        let label;
        if (this.isLogicalVertex(dataAccessor)) {
            label = this.getVertexKeyFromData(data) || data.id;
        } else if (this.isParticleNode(dataAccessor)) {
            label = this.getParticleNameFromData(data) || data.id;
        } else {
            label = data.displayLabel || data.label || data.id;
        }

        return this.htmlLabelToCanvasText(label);
    },

    getParticleNameFromData(data) {
        const explicitName = data.particleName || data.particle_name || data.niceName || data.niceParticleName;
        if (explicitName) return String(explicitName);

        const displayMatch = String(data.displayLabel || data.label || '').match(/^particle:\s*(.+)$/im);
        if (displayMatch) return displayMatch[1].trim();

        const rawMatch = String(data.rawLabel || '').match(/\bpid:\s*([^(<\n]+)/i);
        if (rawMatch) return rawMatch[1].trim();

        const particleId = data.pdgId ?? data.pdgid ?? data.pid ?? data.pdg;
        return particleId !== undefined && particleId !== null ? String(particleId) : '';
    },

    getVertexKeyFromData(data) {
        const explicitKey = data.key ?? data.vertexKey ?? data.vertex_key ?? data.barcode;
        if (explicitKey !== undefined && explicitKey !== null) return String(explicitKey);

        const text = `${data.rawLabel || ''}\n${data.detailLabel || ''}`;
        const match = text.match(/\b(?:GenVertex|SimVertex)[^<\n]*\bkey=([^\s<]+)/i)
            || text.match(/\bkey=([^\s<]+)/i);
        if (match) return match[1];

        const idMatch = String(data.id || '').match(/^v(\d+)$/);
        return idMatch ? idMatch[1] : '';
    },

    extractFourthTupleValue(value) {
        if (typeof value !== 'string') return null;

        const cleaned = value.trim().replace(/^<|>$/g, '').trim();
        if (!cleaned.startsWith('(') || !cleaned.endsWith(')')) return null;

        const parts = cleaned.slice(1, -1).split(',').map(part => part.trim());
        if (parts.length < 4) return null;

        const parsed = Number.parseFloat(parts[3]);
        return Number.isFinite(parsed) ? parsed : null;
    },

    getNodeEnergy(ele) {
        const explicitEnergy = Number.parseFloat(ele.data('energy'));
        if (Number.isFinite(explicitEnergy)) return explicitEnergy;

        return this.extractFourthTupleValue(ele.data('p4'))
            ?? this.extractFourthTupleValue(ele.data('x4'));
    },

    getDagreEdgeWeight(edge) {
        return 1; // attempt to get high energy edges straight
        // const vertexEndpoints = [edge.source(), edge.target()].filter(node => this.isLogicalVertex(node));
        // const energy = vertexEndpoints
        //     .map(node => this.getNodeEnergy(node))
        //     .find(value => Number.isFinite(value) && value > 0);

        // return energy ? Math.max(1, Math.log1p(energy)) : 1;
    },

    hasCrossedBoundary(ele) {
        const value = ele.data('crossedBoundary');
        const value2 = ele.data("nCheckpoints");
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' || value2 == "1";
    },

    hasStatusOne(ele) {
        return String(ele.data('status')).trim() === '1';
    },

    getTruthFillColor(ele) {
        const kind = this.truthKind(ele);
        if (kind === 'artificial') {
            return this.truthArtificialColors[this.truthRole(ele)] || this.truthArtificialColors.interaction;
        }
        if (kind === 'vertex') return this.truthVertexColor;
        return this.truthLevelColors[this.truthLevel(ele)] || this.truthLevelColors.none;
    },

    getNodeTextColor(ele) {
        if (!this.hasTruthClassification(ele)) return '#000';
        return this.truthLevelDarkFills.has(this.getTruthFillColor(ele)) ? '#fff' : '#000';
    },

    getNodeFillColor(ele) {
        if (this.hasTruthClassification(ele)) return this.getTruthFillColor(ele);

        if (this.hasStatusOne(ele)) return this.statusOneNodeColor;

        // The truth-graph dumper encodes detector region / role in the node fillcolor
        // (navajowhite=calo, darkseagreen1=tracker, lightskyblue=muon, gold=seed,
        // aliceblue=GEN-only, ... vertices by role). X11/SVG colour names are
        // understood directly by the browser, so honour them for logical graphs.
        if (this.isLogicalGraph()) {
            const producerFill = this.gvColor(ele.data('fillcolor'));
            if (producerFill) return producerFill;
        }

        const type = this.getNodeKind(ele);
        if (type.startsWith('GenSim')) return this.nodeTypeColors.genSim;
        if (type === 'GenEvent') return this.nodeTypeColors.event;
        if (type.startsWith('Gen')) return this.nodeTypeColors.gen;
        if (type.startsWith('Sim')) return this.nodeTypeColors.sim;

        const fillcolor = ele.data('fillcolor');
        if (fillcolor === 'green') return '#2ecc71';
        if (fillcolor === 'lightgrey') return '#d3d3d3';
        return '#3498db';
    },

    isSeedNode(ele) {
        return String(ele.data('shape') || '').trim().toLowerCase() === 'doublecircle';
    },

    getNodeShape(ele) {
        const truthKind = this.truthKind(ele);
        if (truthKind === 'artificial') {
            return this.truthArtificialShapes[this.truthRole(ele)] || 'star';
        }
        if (truthKind === 'vertex') return 'diamond';
        if (truthKind === 'particle') return 'ellipse';

        if (this.hasStatusOne(ele)) return 'rectangle';

        // Honour the producer's shape encoding (seed/muon/vertex kinds) when we can
        // map it; fall back to the kind-based shapes for graphs that do not set it.
        if (this.isLogicalGraph()) {
            const gvShape = String(ele.data('shape') || '').trim().toLowerCase();
            const mapped = this.gvShapeToCytoscape[gvShape];
            if (mapped) return mapped;
        }

        const type = this.getNodeKind(ele);
        if (type === 'GenEvent') return 'star';
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex') return 'diamond';
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle') return 'ellipse';
        if (this.isParticleNode(ele)) return 'ellipse';

        const shape = ele.data('shape');
        if (shape === 'diamond') return 'diamond';
        if (shape === 'ellipse') return 'ellipse';
        if (shape === 'box') return 'rectangle';
        return 'rectangle';
    },

    getNodeSize(ele) {
        const truthKind = this.truthKind(ele);
        if (truthKind === 'artificial') return this.truthArtificialNodeSize;
        if (truthKind === 'vertex') return this.vertexNodeSize;
        if (truthKind === 'particle') {
            const particleId = this.getParticlePdgId(ele);
            const scale = this.smallParticlePdgIds.has(particleId) ? 0.7 : 1;
            return this.defaultNodeSize * scale;
        }

        const type = this.getNodeKind(ele);
        if (type === 'GenEvent') return this.eventNodeSize;
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex') return this.vertexNodeSize;
        if (this.isLogicalVertex(ele)) return this.vertexNodeSize;
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle' || this.isParticleNode(ele)) {
            const particleId = this.getParticlePdgId(ele);
            const scale = this.smallParticlePdgIds.has(particleId) ? 0.5 : 1;
            const statusScale = this.hasStatusOne(ele) ? this.statusOneNodeSizeMultiplier : 1;
            return this.defaultNodeSize * scale * statusScale;
        }
        return this.defaultNodeSize;
    },

    getNodeFontSize(ele) {
        const truthKind = this.truthKind(ele);
        if (truthKind === 'artificial') return 11;
        if (truthKind === 'vertex') return 8;
        if (truthKind === 'particle') return 16;

        const type = this.getNodeKind(ele);
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex' || this.isLogicalVertex(ele)) {
            return 10;
        }
        return 20;
    },

    getNodeBorderColor(ele) {
        if (this.hasTruthClassification(ele)) {
            if (this.isBackscattered(ele)) return this.truthMarkerColors.backscattered;
            if (this.hasCheckpoints(ele)) return this.truthMarkerColors.checkpoints;
            return this.truthMarkerColors.plain;
        }

        if (this.hasCrossedBoundary(ele)) return '#e804ec';

        // Honour the producer's border colour (the dumper outlines seeds in gold,
        // muons in navy, vertices by role); fall back to the default slate.
        const color = this.gvColor(ele.data('color'));
        return color || '#34495e';
    },

    getNodeBorderWidth(ele) {
        if (this.hasTruthClassification(ele)) {
            if (this.truthKind(ele) !== 'particle') return 1;
            return this.truthFootprintBorderWidths[this.truthFootprint(ele)] ?? 1;
        }

        if (this.hasCrossedBoundary(ele)) return 3;

        // Honour the producer's penwidth so seeds (penwidth 3) and muons stand out.
        const penwidth = Number.parseFloat(ele.data('penwidth'));
        if (Number.isFinite(penwidth) && penwidth > 0) {
            return Math.min(6, Math.max(1, penwidth));
        }
        return 1;
    },

    /**
     * Initialize Cytoscape graph with data
     */
    init(data) {
        console.log('Initializing graph with', data.nodes.length, 'nodes and', data.edges.length, 'edges');
        this.graphName = data.metadata?.graph_name || data.graph_name || '';
        this.updateLegend();
        this.registerLayoutExtensions();

        // Convert data to Cytoscape format
        const elements = {
            nodes: data.nodes.map(n => ({
                data: {
                    id: n.id,
                    ...n,
                    label: this.getCompactLabelFromData(n)
                }
            })),
            edges: data.edges.map(e => ({
                data: {
                    id: `${e.source}-${e.target}`,
                    source: e.source,
                    target: e.target,
                    ...e
                }
            }))
        };

        // Initialize Cytoscape
        this.cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,

            style: [
                // Node styles
                {
                    selector: 'node',
                    style: {
                        'padding': 2,
                        'label': 'data(label)',
                        'text-valign': function(ele) {
                            return GraphManager.truthKind(ele) === 'vertex' ? 'bottom' : 'center';
                        },
                        'text-halign': 'center',
                        'text-margin-y': function(ele) {
                            return GraphManager.truthKind(ele) === 'vertex' ? 3 : 0;
                        },
                        'font-size': function(ele) {
                            return GraphManager.getNodeFontSize(ele);
                        },
                        'font-weight': 600,
                        'text-wrap': 'wrap',
                        'text-max-width': function(ele) {
                            // The vertex four-position needs one line, not the width
                            // of the diamond it sits under.
                            if (GraphManager.truthKind(ele) === 'vertex') return 190;
                            const size = GraphManager.getNodeSize(ele);
                            return Number.isFinite(size) ? Math.max(22, size - 4) : 80;
                        },
                        'line-height': 1.1,
                        'color': function(ele) {
                            return GraphManager.getNodeTextColor(ele);
                        },
                        'text-background-opacity': 0,
                        'text-background-padding': 0,
                        'text-background-shape': 'roundrectangle',
                        'background-color': function(ele) {
                            return GraphManager.getNodeFillColor(ele);
                        },
                        'border-width': function(ele) {
                            return GraphManager.getNodeBorderWidth(ele);
                        },
                        'border-color': function(ele) {
                            return GraphManager.getNodeBorderColor(ele);
                        },
                        'shape': function(ele) {
                            return GraphManager.getNodeShape(ele);
                        },
                        'width': function(ele) {
                            return GraphManager.getNodeSize(ele);
                        },
                        'height': function(ele) {
                            return GraphManager.getNodeSize(ele);
                        },
                        'border-style': function(ele) {
                            if (GraphManager.hasTruthClassification(ele)) {
                                if (GraphManager.isTruthRoot(ele)) return 'double';
                                if (GraphManager.truthKind(ele) === 'particle'
                                    && GraphManager.truthFootprint(ele) === 'none') return 'dashed';
                                return 'solid';
                            }
                            if (GraphManager.hasCrossedBoundary(ele)) return 'double';
                            // Evoke the producer's doublecircle seed marker.
                            if (GraphManager.isSeedNode(ele)) return 'double';
                            return 'solid';
                        }
                    }
                },
                // Highlighted node
                {
                    selector: 'node.highlighted',
                    style: {
                        'border-width': 4,
                        'border-color': '#e74c3c',
                        'z-index': 9999
                    }
                },
                // Selected node
                {
                    selector: 'node.selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#f39c12',
                        'z-index': 9998
                    }
                },
                // Dimmed node
                {
                    selector: 'node.dimmed',
                    style: {
                        'opacity': 0.3
                    }
                },
                // Hidden node
                {
                    selector: 'node.hidden',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.gen-event-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.sim-vertex-key0-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.parton-shower-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.small-subgraph-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                // Edge styles
                {
                    selector: 'edge',
                    style: {
                        // Honour the producer's edge width: the dumper encodes
                        // provenance as red2/penwidth 2.4 (signal), blue/1.3
                        // (underlying event), gray20/dashed/0.8 (the rest).
                        'width': function(ele) {
                            const penwidth = Number.parseFloat(ele.data('penwidth'));
                            return Number.isFinite(penwidth) && penwidth > 0
                                ? Math.min(6, Math.max(0.8, penwidth))
                                : 1;
                        },
                        'line-style': function(ele) {
                            return String(ele.data('style') || '').toLowerCase().includes('dashed')
                                ? 'dashed'
                                : 'solid';
                        },
                        'line-color': function(ele) {
                            return GraphManager.gvColor(ele.data('color')) || '#95a5a6';
                        },
                        'target-arrow-color': function(ele) {
                            return GraphManager.gvColor(ele.data('color')) || '#95a5a6';
                        },
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 1.2
                    }
                },
                // Hidden edge
                {
                    selector: 'edge.hidden',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.gen-event-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.sim-vertex-key0-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.parton-shower-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.small-subgraph-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                // Dimmed edge
                {
                    selector: 'edge.dimmed',
                    style: {
                        'opacity': 0.2
                    }
                },
                // Highlighted edge
                {
                    selector: 'edge.highlighted',
                    style: {
                        'width': 3,
                        'line-color': '#e74c3c',
                        'target-arrow-color': '#e74c3c',
                        'arrow-scale': 1.6,
                        'z-index': 9997
                    }
                },
                // Selected edge
                {
                    selector: 'edge.selected',
                    style: {
                        'width': 3,
                        'line-color': '#f39c12',
                        'target-arrow-color': '#f39c12',
                        'arrow-scale': 1.6,
                        'z-index': 9996
                    }
                }
            ],

            layout: {
                name: 'preset',
                fit: false
            },

            minZoom: 0.02,
            maxZoom: 3,
            wheelSensitivity: 0.2
        });

        // Store full graph for reset
        this.fullGraph = this.cy.elements().clone();

        // Event handlers
        this.setupEventHandlers();
        this.setupViewOptions();
        this.applyInitialViewFilters();

        console.log('Graph initialized successfully');
        return this.cy;
    },

    /**
     * Register optional Cytoscape layout extensions loaded from index.html.
     */
    registerLayoutExtensions() {
        if (!this.dagreRegistered && typeof cytoscapeDagre === 'function') {
            try {
                cytoscape.use(cytoscapeDagre);
                this.dagreRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-dagre', error);
            }
        }

        if (!this.fcoseRegistered && typeof cytoscapeFcose === 'function') {
            try {
                cytoscape.use(cytoscapeFcose);
                this.fcoseRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-fcose', error);
            }
        }

        if (!this.elkRegistered && typeof cytoscapeElk === 'function') {
            try {
                cytoscape.use(cytoscapeElk);
                this.elkRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-elk', error);
            }
        }
    },

    /**
     * Layout configuration for the selected engine.
     */
    getLayoutConfig() {
        if (this.selectedLayoutEngine === 'fcose' && this.fcoseRegistered) {
            return {
                name: 'fcose',
                // animate: false,
                // quality: 'proof',
                // // randomize: false,
                // fit: false,
                // // padding: 30,
                // // nodeRepulsion: 4500,
                // // idealEdgeLength: 55,
                // // edgeElasticity: 0.45,
                // // gravity: 0.25,
                // numIter: 8000

                // "fast" config
                quality: 'proof',
                randomize: true,

                animate: false,
                fit: false,
                padding: 40,

                uniformNodeDimensions: true,
                nodeDimensionsIncludeLabels: false,

                packComponents: true,

                samplingType: true,
                sampleSize: 50,
                nodeSeparation: 500, // from 80

                // Sort-of readable but lots of edge crossings
                // nodeRepulsion: () => 8000,
                // idealEdgeLength: () => 200,
                // edgeElasticity: () => 0.3, // from 0.35
                // gravity: 0.15,
                // gravityRange: 3.8,

                // also good
                nodeRepulsion: () => 12000,
                idealEdgeLength: () => 120,
                edgeElasticity: () => 0.2,
                gravity: 0.05,
                gravityRange: 4.5,

                // The below are not that good, probably needs to have an adjustment bewteen vertex/particle 

                // nodeRepulsion: () => 12000,
                // idealEdgeLength: edge => edge.target().outgoers('node').length == 1 ? 90 : ((edge.target().outgoers('node').length == 2) ? 100 : 140),
                // edgeElasticity: () => 0.2,
                // gravity: 0.05,
                // gravityRange: 4.5,

                // nodeRepulsion: () => 12000000,
                // idealEdgeLength: edge => edge.target().outgoers('node').length == 1 ? 1 : ((edge.target().outgoers('node').length == 2) ? 2 : 5), //  edge => Math.min(20+ 30*(-1+edge.target().outgoers('node').length), 80)
                // edgeElasticity: edge => 1.* (edge.target().outgoers('node').length == 1 ? 0.5 :  ((edge.target().outgoers('node').length == 2) ? 0.6: 0.8)),
                // gravity: 0.1,
                // gravityRange: 3,

                numIter: 30000,
                tile: true,
                tilingPaddingVertical: 12,
                tilingPaddingHorizontal: 12
            };
        }

        if (this.selectedLayoutEngine === 'elk' && this.elkRegistered) {
            return {
                name: 'elk',
                animate: false,
                fit: false,
                elk: {
                    algorithm: 'layered',
                    'elk.direction': 'DOWN',
                    'elk.layered.spacing.nodeNodeBetweenLayers': 5,
                    'elk.spacing.nodeNode': 10,
                    'elk.edgeRouting': 'ORTHOGONAL'

                    // algorithm: 'stress', // Never ending.....
                    // 'elk.stress.iterationLimit':10,

                        //   algorithm: 'disco',
                        // componentLayoutAlgorithm: 'stress',
                        // 'elk.stress.iterationLimit':10,
                }
            };
        }

        if (this.dagreRegistered) {
            return {
                name: 'dagre',
                animate: false,
                rankDir: 'TB',
                ranker: 'network-simplex',
                nodeSep: 20,
                edgeSep: 5,
                rankSep: 80,
                spacingFactor: 0.9,
                fit: false,
                padding: 30,
                edgeWeight: edge => this.getDagreEdgeWeight(edge)
            };
        }

        return {
            name: 'breadthfirst',
            animate: false,
            directed: true,
            spacingFactor: 1.1,
            fit: false,
            padding: 30
        };
    },

    /**
     * Setup event handlers for graph interactions
     */
    setupEventHandlers() {
        // Node click - open panel and select the node
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const nodeId = node.id();
            const label = node.data('label');

            console.log('Node clicked:', label);
            this.applySelection(node);
            PanelManager.open(label, nodeId);
        });

        // Edge click - jump to the endpoint furthest from the current view center.
        this.cy.on('tap', 'edge', (evt) => {
            const edge = evt.target;
            const destination = this.getFurthestEdgeEndpoint(edge);

            if (destination) {
                this.focusNode(destination);
            }
        });

        this.cy.on('mouseover', 'edge', () => {
            this.cy.container().style.cursor = 'pointer';
        });

        this.cy.on('mouseout', 'edge', () => {
            this.cy.container().style.cursor = '';
        });

        // Node hover - expand the two-line label into the full summary
        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            node.style('text-background-color', 'rgba(255, 255, 255, 0.9)');
            this.showNodeTooltip(node, evt.renderedPosition);
        });

        this.cy.on('mousemove', 'node', (evt) => {
            this.moveNodeTooltip(evt.renderedPosition);
        });

        this.cy.on('mouseout', 'node', (evt) => {
            const node = evt.target;
            node.style('text-background-color', 'rgba(255, 255, 255, 0.7)');
            this.hideNodeTooltip();
        });

        this.cy.on('pan zoom', () => this.hideNodeTooltip());

        // Background click - clear selection
        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.clearSelection();
            }
        });
    },

    /**
     * Show the legend that matches the loaded graph. The logical truth graph is
     * standalone, so its legend replaces the GEN/SIM one rather than adding to it.
     */
    updateLegend() {
        const truthLegend = document.getElementById('legend-truth');
        const genSimLegend = document.getElementById('legend-gensim');
        if (!truthLegend || !genSimLegend) return;

        const isTruth = this.isLogicalGraph();
        truthLegend.classList.toggle('hidden', !isTruth);
        genSimLegend.classList.toggle('hidden', isTruth);

        // The GEN/SIM view options have no meaning in the standalone truth graph.
        document.querySelectorAll('.gensim-only').forEach((element) => {
            element.classList.toggle('hidden', isTruth);
        });
    },

    /**
     * Return the element that carries the hover summary, creating it on first use.
     */
    nodeTooltipElement() {
        if (!this._nodeTooltip) {
            const element = document.createElement('div');
            element.id = 'node-tooltip';
            element.className = 'hidden';
            document.body.appendChild(element);
            this._nodeTooltip = element;
        }
        return this._nodeTooltip;
    },

    /**
     * Show the full node summary next to the cursor. The canvas label stays at
     * two lines, so the rest of the truth information appears only on hover.
     */
    showNodeTooltip(node, renderedPosition) {
        const text = node.data('truthHover') || node.data('tooltip') || node.data('detailLabel');
        if (!text) return;

        const element = this.nodeTooltipElement();
        element.textContent = this.htmlLabelToCanvasText(text);
        element.classList.remove('hidden');
        this.moveNodeTooltip(renderedPosition);
    },

    moveNodeTooltip(renderedPosition) {
        if (!this._nodeTooltip || this._nodeTooltip.classList.contains('hidden')) return;
        if (!renderedPosition) return;

        const container = this.cy.container().getBoundingClientRect();
        const element = this._nodeTooltip;
        const left = container.left + renderedPosition.x + 16;
        const top = container.top + renderedPosition.y + 16;
        const maxLeft = window.innerWidth - element.offsetWidth - 8;
        const maxTop = window.innerHeight - element.offsetHeight - 8;

        element.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
        element.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
    },

    hideNodeTooltip() {
        if (this._nodeTooltip) this._nodeTooltip.classList.add('hidden');
    },

    /**
     * Setup graph-level view option controls.
     */
    setupLegendToggle() {
        const toggle = document.getElementById('legend-toggle');
        const legend = document.getElementById('legend');
        if (!toggle || !legend) return;

        toggle.addEventListener('click', () => {
            const collapsed = legend.classList.toggle('collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
        });
    },

    setupViewOptions() {
        this.setupLegendToggle();
        const hideGenEventCheckbox = document.getElementById('hide-gen-event-checkbox');
        if (hideGenEventCheckbox) {
            hideGenEventCheckbox.checked = this.hideGenEventNodes;
            hideGenEventCheckbox.addEventListener('change', () => {
                this.setHideGenEventNodes(hideGenEventCheckbox.checked);
            });
        }

        const hideSimVertexKey0Checkbox = document.getElementById('hide-simvertex-key0-checkbox');
        if (hideSimVertexKey0Checkbox) {
            hideSimVertexKey0Checkbox.checked = this.hideSimVertexKey0Node;
            hideSimVertexKey0Checkbox.addEventListener('change', () => {
                this.setHideSimVertexKey0Node(hideSimVertexKey0Checkbox.checked);
            });
        }

        const hideSmallSubgraphsCheckbox = document.getElementById('hide-small-subgraphs-checkbox');
        if (hideSmallSubgraphsCheckbox) {
            hideSmallSubgraphsCheckbox.checked = this.hideSmallDisconnectedSubgraphs;
            hideSmallSubgraphsCheckbox.addEventListener('change', () => {
                this.setHideSmallDisconnectedSubgraphs(hideSmallSubgraphsCheckbox.checked);
            });
        }

        const hidePartonShowerCheckbox = document.getElementById('hide-parton-shower-checkbox');
        if (hidePartonShowerCheckbox) {
            hidePartonShowerCheckbox.checked = this.hidePartonShower;
            hidePartonShowerCheckbox.addEventListener('change', () => {
                this.setHidePartonShower(hidePartonShowerCheckbox.checked);
            });
        }

        const layoutEngineSelect = document.getElementById('layout-engine-select');
        if (layoutEngineSelect) {
            layoutEngineSelect.value = this.selectedLayoutEngine;
        }

        const layoutApplyBtn = document.getElementById('layout-apply-btn');
        if (layoutApplyBtn) {
            layoutApplyBtn.addEventListener('click', () => {
                this.setLayoutEngine(layoutEngineSelect ? layoutEngineSelect.value : this.selectedLayoutEngine);
            });
        }

        const layoutCancelBtn = document.getElementById('layout-cancel-btn');
        if (layoutCancelBtn) {
            layoutCancelBtn.addEventListener('click', () => this.cancelActiveLayout());
        }
    },

    /**
     * Switch layout engines and recompute positions for visible elements.
     */
    setLayoutEngine(engine) {
        if (engine !== 'dagre' && engine !== 'fcose' && engine !== 'elk') {
            return;
        }

        this.selectedLayoutEngine = engine;
        this.relayoutVisible();
    },

    /**
     * Apply default view filters after Cytoscape elements exist.
     */
    applyInitialViewFilters() {
        this.applyGenEventFilter();
        this.applySimVertexKey0Filter();
        this.applyPartonShowerFilter();
        this.applySmallDisconnectedSubgraphFilter();
        this.relayoutVisible();
    },

    /**
     * Toggle nodes whose DOT label contains GenEvent.
     */
    setHideGenEventNodes(shouldHide) {
        this.hideGenEventNodes = shouldHide;
        this.applyGenEventFilter();
        this.relayoutVisible();
    },

    /**
     * Apply the GenEvent view filter without disturbing focus/dependency filters.
     */
    applyGenEventFilter() {
        this.cy.nodes().removeClass('gen-event-filtered');
        this.cy.edges().removeClass('gen-event-filtered');

        if (!this.hideGenEventNodes) {
            return;
        }

        const genEventNodes = this.cy.nodes().filter(node => this.isGenEventNode(node));
        genEventNodes.addClass('gen-event-filtered');
        genEventNodes.connectedEdges().addClass('gen-event-filtered');
    },

    /**
     * The source DOT label is stored as rawLabel; fall back to label for older bundles.
     */
    isGenEventNode(node) {
        const labelAttribute = node.data('rawLabel') || node.data('label') || '';
        return String(labelAttribute).includes('GenEvent');
    },

    /**
     * Hide the SimVertex whose source label contains key=0.
     */
    setHideSimVertexKey0Node(shouldHide) {
        this.hideSimVertexKey0Node = shouldHide;
        this.applySimVertexKey0Filter();
        this.relayoutVisible();
    },

    /**
     * Apply the SimVertex key=0 view filter without disturbing focus/dependency filters.
     */
    applySimVertexKey0Filter() {
        this.cy.nodes().removeClass('sim-vertex-key0-filtered');
        this.cy.edges().removeClass('sim-vertex-key0-filtered');

        if (!this.hideSimVertexKey0Node) {
            return;
        }

        const simVertexKey0Nodes = this.cy.nodes().filter(node => this.isSimVertexKey0Node(node));
        simVertexKey0Nodes.addClass('sim-vertex-key0-filtered');
        simVertexKey0Nodes.connectedEdges().addClass('sim-vertex-key0-filtered');
    },

    /**
     * The source DOT label is stored as rawLabel; fall back to label for older bundles.
     */
    isSimVertexKey0Node(node) {
        const labelAttribute = node.data('rawLabel') || node.data('label') || '';
        const label = String(labelAttribute);
        return label.includes('SimVertex') && /\bkey=0\b/.test(label);
    },

    /**
     * Hide status=2 gluons and add temporary edges from their parents to children.
     */
    setHidePartonShower(shouldHide) {
        this.hidePartonShower = shouldHide;
        this.applyPartonShowerFilter();
        this.relayoutVisible();
    },

    applyPartonShowerFilter() {
        this.cy.edges('[isPartonShowerBypass]').remove();
        this.cy.nodes().removeClass('parton-shower-filtered');
        this.cy.edges().removeClass('parton-shower-filtered');

        if (!this.hidePartonShower) {
            return;
        }

        const partonShowerNodes = this.cy.nodes().filter(node => this.isPartonShowerNode(node));
        const parentVertices = this.getSingleChildParentVertices(partonShowerNodes);
        const hiddenNodes = partonShowerNodes.union(parentVertices);

        hiddenNodes.addClass('parton-shower-filtered');
        hiddenNodes.connectedEdges().addClass('parton-shower-filtered');
        this.addPartonShowerBypassEdges(hiddenNodes);
    },

    isPartonShowerNode(node) {
        const status = Number.parseInt(node.data('status'), 10);
        return (status > 30 && status < 80 && status!=62 && Math.abs(this.getParticlePdgId(node))!=6) || (this.getParticlePdgId(node) === 21 && ( !(status == 2 || status == 11 || status == 71 || status == 72) || this.getNodeEnergy(node)<10 ) );
    },

    getSingleChildParentVertices(partonShowerNodes) {
        let parentVertices = this.cy.collection();

        partonShowerNodes.forEach(node => {
            node.incomers('node').forEach(parent => {
                if (this.isSingleChildParentVertex(parent, node)) {
                    parentVertices = parentVertices.union(parent);
                }
            });
        });

        return parentVertices;
    },

    isSingleChildParentVertex(parent, child) {
        if (!this.isVertexNode(parent)) {
            return false;
        }

        const children = parent.outgoers('node');
        return children.length === 1 && children[0].id() === child.id();
    },

    isVertexNode(node) {
        const type = this.getNodeKind(node);
        const shape = String(node.data('shape') || '').trim();
        return type === 'GenVertex'
            || type === 'SimVertex'
            || type === 'GenSimVertex'
            || type === 'LogicalVertex'
            || shape === 'diamond'
            || this.isLogicalVertex(node);
    },

    addPartonShowerBypassEdges(hiddenNodes) {
        const hiddenIds = new Set(hiddenNodes.map(node => node.id()));
        const edgeKeys = new Set(this.cy.edges().map(edge => `${edge.source().id()}->${edge.target().id()}`));
        const bypassEdges = [];

        hiddenNodes.forEach(node => {
            const parents = this.getVisibleBoundaryNodes(node, 'in', hiddenIds);
            const children = this.getVisibleBoundaryNodes(node, 'out', hiddenIds);

            parents.forEach(parent => {
                children.forEach(child => {
                    if (parent.id() === child.id()) {
                        return;
                    }

                    const edgeKey = `${parent.id()}->${child.id()}`;
                    if (edgeKeys.has(edgeKey)) {
                        return;
                    }

                    edgeKeys.add(edgeKey);
                    bypassEdges.push({
                        group: 'edges',
                        data: {
                            id: `parton-shower-bypass-${parent.id()}-${child.id()}`,
                            source: parent.id(),
                            target: child.id(),
                            isPartonShowerBypass: true
                        }
                    });
                });
            });
        });

        if (bypassEdges.length > 0) {
            this.cy.add(bypassEdges);
        }
    },

    getVisibleBoundaryNodes(startNode, direction, hiddenIds) {
        const visited = new Set([startNode.id()]);
        const stack = [startNode];
        const boundaryNodes = this.cy.collection();
        const useIncoming = direction === 'in';

        while (stack.length > 0) {
            const node = stack.pop();
            const edges = useIncoming ? node.incomers('edge') : node.outgoers('edge');

            edges.forEach(edge => {
                if (edge.data('isPartonShowerBypass')) {
                    return;
                }

                const nextNode = useIncoming ? edge.source() : edge.target();
                if (visited.has(nextNode.id())) {
                    return;
                }

                visited.add(nextNode.id());
                if (hiddenIds.has(nextNode.id())) {
                    stack.push(nextNode);
                } else {
                    boundaryNodes.merge(nextNode);
                }
            });
        }

        return boundaryNodes;
    },

    /**
     * Hide disconnected components whose total size is below the configured limit.
     */
    setHideSmallDisconnectedSubgraphs(shouldHide) {
        this.hideSmallDisconnectedSubgraphs = shouldHide;
        this.applySmallDisconnectedSubgraphFilter();
        this.relayoutVisible();
    },

    /**
     * Apply the small disconnected subgraph filter without disturbing other filters.
     */
    applySmallDisconnectedSubgraphFilter() {
        this.cy.nodes().removeClass('small-subgraph-filtered');
        this.cy.edges().removeClass('small-subgraph-filtered');

        if (!this.hideSmallDisconnectedSubgraphs) {
            return;
        }

        this.getSmallDisconnectedSubgraphNodes().addClass('small-subgraph-filtered');
        this.cy.nodes('.small-subgraph-filtered').connectedEdges().addClass('small-subgraph-filtered');
    },

    /**
     * Connected components are computed as undirected components over the full graph.
     */
    getSmallDisconnectedSubgraphNodes() {
        const visited = new Set();
        let nodesToHide = this.cy.collection();

        this.cy.nodes().forEach(startNode => {
            if (visited.has(startNode.id())) {
                return;
            }

            const componentNodes = [];
            const stack = [startNode];
            visited.add(startNode.id());

            while (stack.length > 0) {
                const node = stack.pop();
                componentNodes.push(node);

                node.connectedEdges().forEach(edge => {
                    const source = edge.source();
                    const target = edge.target();
                    const neighbor = source.id() === node.id() ? target : source;

                    if (!visited.has(neighbor.id())) {
                        visited.add(neighbor.id());
                        stack.push(neighbor);
                    }
                });
            }

            if (componentNodes.length < this.smallDisconnectedSubgraphNodeLimit) {
                nodesToHide = nodesToHide.union(this.cy.collection(componentNodes));
            }
        });

        return nodesToHide;
    },

    /**
     * Highlight a specific node
     */
    highlightNode(nodeId) {
        this.clearHighlight();
        const node = this.cy.getElementById(nodeId);
        if (node.length > 0) {
            node.addClass('highlighted');
            node.connectedEdges().addClass('highlighted');
            this.cy.animate({
                center: { eles: node },
                zoom: 1.5
            }, {
                duration: 500
            });
            return true;
        }
        return false;
    },

    /**
     * Select and center the graph on a node.
     */
    focusNode(node) {
        this.applySelection(node);

        this.cy.animate({
            center: { eles: node },
            zoom: this.cy.zoom()
        }, {
            duration: 300
        });
    },

    /**
     * Mark a node and its connected arrows as selected.
     */
    applySelection(node) {
        this.cy.nodes().removeClass('selected');
        this.cy.edges().removeClass('selected');
        node.addClass('selected');
        node.connectedEdges().addClass('selected');
        KeyboardNav.selectedNode = node;

        document.dispatchEvent(new CustomEvent('nodeSelected', {
            detail: {
                nodeId: node.id(),
                nodeName: node.data('label') || node.id()
            }
        }));
    },

    /**
     * Return the endpoint of an edge that is furthest from the current viewport center.
     */
    getFurthestEdgeEndpoint(edge) {
        const source = edge.source();
        const target = edge.target();

        if (source.length === 0 || target.length === 0) {
            return null;
        }

        const center = this.getViewportCenter();
        const sourceDistance = this.distanceBetween(center, source.position());
        const targetDistance = this.distanceBetween(center, target.position());

        return sourceDistance > targetDistance ? source : target;
    },

    /**
     * Current visible viewport center in graph coordinates.
     */
    getViewportCenter() {
        const extent = this.cy.extent();

        return {
            x: (extent.x1 + extent.x2) / 2,
            y: (extent.y1 + extent.y2) / 2
        };
    },

    /**
     * Calculate distance between two graph positions.
     */
    distanceBetween(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Clear all highlights
     */
    clearHighlight() {
        this.cy.nodes().removeClass('highlighted dimmed');
        this.cy.edges().removeClass('highlighted dimmed');
    },

    /**
     * Clear selection
     */
    clearSelection() {
        this.cy.nodes().removeClass('selected');
        this.cy.edges().removeClass('selected');
        KeyboardNav.selectedNode = null;

        document.dispatchEvent(new CustomEvent('nodeSelectionCleared'));
    },

    /**
     * Return selected nodes for apply-based filters, falling back to the open panel node.
     */
    getSelectedNodesForFiltering() {
        let selectedNodes = this.cy.nodes('.selected');

        if (selectedNodes.length > 0) {
            return selectedNodes;
        }

        if (!PanelManager.currentNode) {
            return this.cy.collection();
        }

        return this.getNodeByLabel(PanelManager.currentNode);
    },

    /**
     * Clear focus/dependency visibility filtering while preserving view option filters.
     */
    clearSelectionFilter() {
        this.cy.nodes().removeClass('hidden');
        this.cy.edges().removeClass('hidden');
        this.clearHighlight();
        this.fitVisible();
    },

    /**
     * Reset graph to full view
     */
    reset() {
        this.cy.nodes().removeClass('highlighted dimmed selected hidden');
        this.cy.edges().removeClass('highlighted dimmed selected hidden');
        this.applyGenEventFilter();
        this.applySimVertexKey0Filter();
        this.applyPartonShowerFilter();
        this.applySmallDisconnectedSubgraphFilter();
        this.fitVisible();
    },

    /**
     * Get node by label
     */
    getNodeByLabel(label) {
        return this.cy.nodes().filter(node => {
            return node.data('label') === label || node.data('id') === label;
        });
    },

    /**
     * Get source node data from the bundle by ID
     */
    getBundleNode(nodeId) {
        return window.bundleData?.nodes?.find(node => node.id === nodeId) || null;
    },

    /**
     * Fit graph to viewport
     */
    fit() {
        this.fitVisible();
    },

    /**
     * Recompute layout using only nodes still visible after all active filters.
     */
    relayoutVisible() {
        const visibleNodes = this.getVisibleNodes();

        if (visibleNodes.length === 0) {
            this.cy.fit();
            this.hideLayoutStatus();
            return;
        }

        const visibleEdges = this.cy.edges().filter(edge => {
            return this.isEdgeVisibleForLayout(edge);
        });

        if (this.shouldUseWorkerDagreLayout()) {
            this.runWorkerDagreLayout(visibleNodes, visibleEdges);
            return;
        }

        const layout = visibleNodes.union(visibleEdges).layout(this.getLayoutConfig());
        this.runLayout(layout);
    },

    shouldUseWorkerDagreLayout() {
        return this.selectedLayoutEngine === 'dagre'
            && this.dagreRegistered
            && typeof window !== 'undefined'
            && typeof window.Worker === 'function';
    },

    runWorkerDagreLayout(visibleNodes, visibleEdges) {
        this.cancelActiveLayout({ silent: true });

        const runId = this.layoutRunId + 1;
        this.layoutRunId = runId;
        this.canceledLayoutRunId = null;
        this.showLayoutStatus();

        const workerLayout = {
            stop: () => {
                if (this.activeLayoutWorker) {
                    this.activeLayoutWorker.terminate();
                    this.activeLayoutWorker = null;
                }
            }
        };

        this.activeLayout = workerLayout;
        const payload = this.buildDagreWorkerPayload(visibleNodes, visibleEdges);

        this.pendingLayoutStart = this.scheduleLayoutStart(() => {
            if (this.layoutRunId !== runId || this.activeLayout !== workerLayout) {
                return;
            }

            this.pendingLayoutStart = null;
            this.startDagreWorker(runId, workerLayout, payload, visibleNodes, visibleEdges);
        });
    },

    buildDagreWorkerPayload(visibleNodes, visibleEdges) {
        return {
            options: {
                rankdir: 'TB',
                ranker: 'network-simplex',
                nodesep: 20,
                edgesep: 5,
                ranksep: 80,
                marginx: 30,
                marginy: 30,
                spacingFactor: 0.9
            },
            nodes: visibleNodes.map(node => ({
                id: node.id(),
                width: Math.max(1, node.outerWidth()),
                height: Math.max(1, node.outerHeight())
            })),
            edges: visibleEdges.map(edge => ({
                id: edge.id(),
                source: edge.source().id(),
                target: edge.target().id(),
                weight: this.getDagreEdgeWeight(edge)
            }))
        };
    },

    startDagreWorker(runId, workerLayout, payload, visibleNodes, visibleEdges) {
        let worker;

        try {
            worker = new Worker(new URL('js/layout-worker.js', window.location.href));
        } catch (error) {
            console.warn('Could not start layout worker; falling back to main-thread Dagre layout.', error);
            this.activeLayout = null;
            this.runLayout(visibleNodes.union(visibleEdges).layout(this.getLayoutConfig()));
            return;
        }

        this.activeLayoutWorker = worker;

        worker.onmessage = event => {
            if (this.layoutRunId !== runId || this.activeLayout !== workerLayout) {
                worker.terminate();
                return;
            }

            this.activeLayoutWorker = null;
            this.activeLayout = null;
            worker.terminate();

            const positions = event.data?.positions || [];
            this.applyWorkerLayoutPositions(positions);
            if (this.canceledLayoutRunId !== runId) {
                this.fitVisible();
            }
            this.hideLayoutStatus();
        };

        worker.onerror = error => {
            if (this.layoutRunId !== runId || this.activeLayout !== workerLayout) {
                worker.terminate();
                return;
            }

            console.warn('Layout worker failed; falling back to main-thread Dagre layout.', error);
            this.activeLayoutWorker = null;
            this.activeLayout = null;
            worker.terminate();
            this.runLayout(visibleNodes.union(visibleEdges).layout(this.getLayoutConfig()));
        };

        worker.postMessage(payload);
    },

    applyWorkerLayoutPositions(positions) {
        this.cy.batch(() => {
            positions.forEach(position => {
                const node = this.cy.getElementById(position.id);
                if (node.nonempty()) {
                    node.position({ x: position.x, y: position.y });
                }
            });
        });
    },

    /**
     * Run a layout with status UI and cancellation support.
     */
    runLayout(layout) {
        this.cancelActiveLayout({ silent: true });

        const runId = this.layoutRunId + 1;
        this.layoutRunId = runId;
        this.canceledLayoutRunId = null;
        this.activeLayout = layout;
        this.showLayoutStatus();

        layout.one('layoutstop', () => {
            if (this.layoutRunId !== runId) {
                return;
            }

            this.activeLayout = null;
            if (this.canceledLayoutRunId !== runId) {
                this.fitVisible();
            }
            this.hideLayoutStatus();
        });

        this.pendingLayoutStart = this.scheduleLayoutStart(() => {
            if (this.layoutRunId !== runId || this.activeLayout !== layout) {
                return;
            }

            this.pendingLayoutStart = null;
            layout.run();
        });
    },

    /**
     * Stop the currently running layout, if the engine supports interruption.
     */
    cancelActiveLayout(options = {}) {
        this.cancelPendingLayoutStart();

        if (!this.activeLayout) {
            return;
        }

        const layout = this.activeLayout;
        this.canceledLayoutRunId = this.layoutRunId;
        this.activeLayout = null;

        if (typeof layout.stop === 'function') {
            layout.stop();
        }

        if (this.activeLayoutWorker) {
            this.activeLayoutWorker.terminate();
            this.activeLayoutWorker = null;
        }

        if (!options.silent) {
            this.hideLayoutStatus();
        }
    },

    scheduleLayoutStart(callback) {
        if (typeof window === 'undefined') {
            callback();
            return null;
        }

        const start = {
            frameId: null,
            timeoutId: null
        };

        const queueLayoutStart = () => {
            start.frameId = null;
            start.timeoutId = window.setTimeout(() => {
                start.timeoutId = null;
                callback();
            }, 0);
        };

        if (window.requestAnimationFrame) {
            start.frameId = window.requestAnimationFrame(queueLayoutStart);
        } else {
            start.frameId = window.setTimeout(queueLayoutStart, 0);
        }

        return start;
    },

    cancelPendingLayoutStart() {
        if (!this.pendingLayoutStart || typeof window === 'undefined') {
            this.pendingLayoutStart = null;
            return;
        }

        if (this.pendingLayoutStart.frameId !== null) {
            if (window.cancelAnimationFrame) {
                window.cancelAnimationFrame(this.pendingLayoutStart.frameId);
            } else {
                window.clearTimeout(this.pendingLayoutStart.frameId);
            }
        }

        if (this.pendingLayoutStart.timeoutId !== null) {
            window.clearTimeout(this.pendingLayoutStart.timeoutId);
        }

        this.pendingLayoutStart = null;
    },

    showLayoutStatus() {
        const status = document.getElementById('layout-status');
        const statusText = document.getElementById('layout-status-text');
        if (!status) {
            return;
        }

        if (statusText) {
            statusText.textContent = `Running ${this.getSelectedLayoutLabel()} layout...`;
        }
        status.classList.remove('hidden');
    },

    hideLayoutStatus() {
        const status = document.getElementById('layout-status');
        if (status) {
            status.classList.add('hidden');
        }
    },

    getSelectedLayoutLabel() {
        if (this.selectedLayoutEngine === 'fcose') return 'fCoSE';
        if (this.selectedLayoutEngine === 'elk') return 'ELK';
        return 'Dagre';
    },

    /**
     * Nodes still visible after all active filters.
     */
    getVisibleNodes() {
        return this.cy.nodes().filter(node => this.isNodeVisibleForLayout(node));
    },

    isNodeVisibleForLayout(node) {
        return !node.hasClass('hidden')
            && !node.hasClass('gen-event-filtered')
            && !node.hasClass('sim-vertex-key0-filtered')
            && !node.hasClass('parton-shower-filtered')
            && !node.hasClass('small-subgraph-filtered');
    },

    isEdgeVisibleForLayout(edge) {
        return !edge.hasClass('hidden')
            && !edge.hasClass('gen-event-filtered')
            && !edge.hasClass('sim-vertex-key0-filtered')
            && !edge.hasClass('parton-shower-filtered')
            && !edge.hasClass('small-subgraph-filtered')
            && this.isNodeVisibleForLayout(edge.source())
            && this.isNodeVisibleForLayout(edge.target());
    },

    /**
     * Fit to nodes still visible after all active filters.
     */
    fitVisible() {
        const visibleNodes = this.getVisibleNodes();

        if (visibleNodes.length > 0) {
            this.cy.fit(visibleNodes);
        } else {
            this.cy.fit();
        }
    }
};
