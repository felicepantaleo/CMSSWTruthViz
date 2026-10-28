# Prepared events

Eight single events, ready to open in the viewer. Each folder holds the truth graph as a
gzipped DOT, the trackster associations of the same event as JSON, the rechit table as
NanoAOD, `event.json` with the event index inside that table, and, where the graph is
small enough to read on a page, the graph rendered to PDF. The three viewer inputs come
from one `cmsRun` job, so the particle indices in the JSON refer to the nodes of the DOT
next to it.

```bash
./load_event.sh                      # list them
./load_event.sh demo/dy_to_tautau    # load one and start the server
```

| folder | sample | event | nodes | reco objects |
|---|---|---|---|---|
| `dy_to_tautau` | DYToLL M50 14 TeV | 7 | 470 | 9 |
| `ten_taus_event4` | TenTau 15 to 500 GeV | 4 | 511 | 105 |
| `z_ee` | ZEE 14 TeV | 3 | 422 | 18 |
| `vbf_h_invisible` | VBF H to ZZ to four neutrinos | 1 | 873 | 47 |
| `ten_taus` | TenTau 15 to 500 GeV | 3 | 1245 | 39 |
| `h_gammagamma` | H125 to two photons, gluon fusion | 2 | 2551 | 57 |
| `dy_to_ee` | DYToLL M50 14 TeV | 3 | 3147 | 43 |
| `ttbar` | TTbar 14 TeV | 7 | 7701 | 216 |

Six of the eight are dumped on 2026-10-28 with `CMSSW_20_1_X_2026-10-27-2300`, the first
IB that contains the merged truth graph association and validation (cms-sw/cmssw#51829).
The truth graph and the DOT come from the release code without changes. The trackster
association JSON comes from `TruthBranchTracksterAssociationJsonDumper`, which is not in
the release: it is added to a separate scratch area of the same IB and not committed.

These six carry the merged vocabulary. The levels are `hardProcess`, `signal`,
`tauVisibleHadronic`, `tauVisibleLeptonic`, `stableLegsFromInitialState`,
`reconstructableFromSignal`, `reconstructableFinalState`, `stableDecayProducts`,
`caloBoundary`, `partonJets`, `bHadrons`, `cHadrons` and `underlyingEvent`. The vertex
roles are `interaction`, `initial state`, `beam side input` and `underlying event`. A
GEN-only vertex now has a reason of its own: `HardScatter`, `ShowerBranching`,
`Hadronization` or `Decay`. A vertex with a SIM side keeps its Geant4 reason.

Their RECO input is a Run4 D120 relval step3 produced with `CMSSW_20_1_0_pre2`. The dump
reads it with the renamed TICL association products dropped on input, with
`--geometry ExtendedRun4D120` (the cfg default is now D127), and with the CPU as the only
accelerator. The step3 has no offline barrel PFRecHits, so the trackster association
runs with an empty `pfRecHits` list. That list weights barrel cells only; the associated
collections, `ticlTrackstersCLUE3DHigh` and `ticlCandidate`, are HGCAL tracksters. Only
the truth graph is from the merged release; the TICL objects are from pre2.

`z_ee` and `vbf_h_invisible` are the earlier pair: Run4 D122, `CMSSW_20_1_X_2026-09-03-1100`
with an early `truth-adaptive-associator-v1`, so they still carry `visibleTau` and
`stableLegsFromUpstream`, and their GEN vertices have no reason. The viewer reads both
vocabularies.

`event.json` records the release and the dumper preset of each event.

Every graph is dumped with `dumpSimHits=True`, so each node carries the DetIds of its hits in
`directHitsDetIds`. The 3D panel joins them with the rechit table by DetId. Without it the
panel draws no hits.

Start with `dy_to_tautau`: a Z to two taus, which is the smallest graph and shows the tau
levels and the `HardScatter` vertex. `ttbar` is the busiest: the main event keeps its
parton shower, so `ShowerBranching` and `Hadronization` vertices show, and every spectator
keeps its SIM subgraph. Set `Hide E <` to 1 GeV, or use the level check list, to make it
readable.

The graphs are stored gzipped. The preprocessing reads a `.dot.gz` directly.
