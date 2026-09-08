# Prepared events

Six single events, ready to open in the viewer. Each folder holds the truth graph as DOT,
the trackster associations of the same event as JSON, the rechit table as NanoAOD, the
graph rendered to PDF, and `event.json` with the event index inside the rechit table.
The three viewer inputs come from one `cmsRun` job, so the particle indices in the JSON
refer to the nodes of the DOT next to it.

```bash
./load_event.sh              # list them
./load_event.sh demo/z_ee    # load one and start the server
```

| folder | sample | event | nodes | reco objects |
|---|---|---|---|---|
| `z_ee` | ZEE 14 TeV | 3 | 422 | 18 |
| `ten_taus_event4` | TenTau 15 to 500 GeV | 4 | 457 | 17 |
| `ten_taus` | TenTau 15 to 500 GeV | 3 | 898 | 5 |
| `ttbar` | TTbar 14 TeV | 7 | 2566 | 93 |
| `vbf_h_invisible` | VBF H to ZZ to four neutrinos | 1 | 873 | 47 |
| `h_gammagamma` | H125 to two photons, gluon fusion | 8 | 338 | 43 |

All six: Run4 D122, era `Phase2C26I13M9`, conditions `auto:phase2_realistic_T35`, no
pileup, `CMSSW_20_1_X_2026-09-03-1100` with the `truth-adaptive-associator-v1-recoviz`
branch. `event.json` records the dumper preset of each one.

Start with `z_ee`: the two electrons and their bremsstrahlung photons show what the
adaptive match does, and the layout opens in a few seconds. `ttbar` is the busiest and
takes tens of seconds to lay out.

## What the working points do

The number of matched reco objects is the same at every working point, by construction:
the adaptive search changes which branch an object matches, never whether it matches. What
moves is the node at the end of the dashed match edge. The viewer draws, at `Fixed`, the
best candidate at the `caloBoundary` level, because the `Fixed` map ranks every candidate
root by shared energy and its first entry is a hard-process ancestor on a busy event.

## Making more events

The three inputs of one event come from one job:

```bash
cmsRun PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py \
  file:step3.root -n <event> -o out --geometry ExtendedRun4D122 --associations \
  -s 6,-6 -d 1 --keepProductionSiblings          # the ttbar preset
```

The config has no skip option: it reads from the start and the JSON holds the last event
processed, so `-n N` gives event N and the rechit table holds N events, the wanted one
last. The GEN-SIM-RECO files these came from are at
`felice.web.cern.ch/orbit/physics_days_2026/demo/reco/`.

## Rendering a graph outside the viewer

`dot` cannot read these DOT files as they are: the `directHitsDetIds` attribute of a big
shower is longer than the 16 KB Graphviz allows in a quoted string. Strip the hit
attributes first, they carry no label text:

```bash
python3 -c "import re,sys; t=open(sys.argv[1]).read(); \
  open(sys.argv[2],'w').write(re.sub(r', directHits(DetIds|Energies)=\"[^\"]*\"', '', t))" \
  in.dot stripped.dot
dot -Tpdf stripped.dot -o graph.pdf     # vector, text stays selectable
unflatten -f -l 6 stripped.dot | dot -Tpdf -o graph.pdf   # far less extreme aspect ratio
```

The PDFs here are the plain `dot` layout. They are one very large page, up to 5.9 m by
114 m for ttbar, so zoom in rather than print. A PNG of the whole graph is not useful at
any size a renderer can produce: at native scale ttbar would be 5.5 gigapixels, and at the
20000 pixel limit the node text is under one pixel.
