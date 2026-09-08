# Running the demo on a laptop

The viewer needs no network while it runs: the JavaScript libraries are in `app/vendor`
and the six events are in `demo/`. The one step that needs network is creating the Python
environment, so do it before the talk.

## Once, with network

```bash
git clone https://github.com/felicepantaleo/CMSSWTruthViz.git
cd CMSSWTruthViz
./load_event.sh demo/z_ee
```

The first run creates `venv/` and installs `pydot`, `networkx`, `particle` and `uproot`.
It then loads the event and starts the server, which prints its URL, normally
<http://localhost:8009/app/>. Open it and check three things: the graph appears, the teal
reco objects hang under the particles they matched, and clicking a node with hits and
choosing `Direct hits` draws them in the 3D panel.

Python 3.9 or newer is needed. On macOS `brew install python@3.12` gives one; the script
picks the first suitable interpreter it finds.

## During the talk, with or without network

```bash
./load_event.sh              # lists the six events
./load_event.sh demo/z_ee    # loads one and starts the server
```

`load_event.sh` copies the associations of that event, builds its rechit table and starts
the server on the graph. Stop it with Ctrl-C before loading another event.

`./run.sh --dot demo/<event>/truthlogicalgraph_*.dot` works too: when the DOT sits in a
prepared folder it loads that event's associations and rechit table by itself.

Nothing is fetched from the internet: the libraries come from `app/vendor`, the data from
`demo/`. An unstable connection cannot break the demo.

## Which event to show

| folder | what to look at | opens in |
|---|---|---|
| `demo/z_ee` | the Z, its two electrons and their bremsstrahlung photons | a few seconds |
| `demo/ten_taus_event4` | ten taus, decay modes, a three-prong trackster matched at the tau | a few seconds |
| `demo/h_gammagamma` | two photons, a pair-conversion vertex | a few seconds |
| `demo/vbf_h_invisible` | the Higgs to four neutrinos, leaves with no hits, the tagging jets | ten seconds |
| `demo/ttbar` | two tops, the b hadrons, 93 reco objects, the busiest | tens of seconds |

Switch the working point with the radio buttons: the number of matched objects stays the
same at every point, what moves is the truth node at the end of the dashed edge.

`Direct hits` and `Subgraph hits` open the 3D panel: the beam axis runs horizontally, the
CMS envelope and the subdetectors are drawn as transparent cylinders, and each subdetector
has its own colour and marker.

## If something goes wrong

- The page is blank: reload it. If it stays blank, check the terminal where the server
  runs for a Python error.
- The layout takes too long on `ttbar`: press `Cancel` next to the layout status, or use a
  smaller event. `Hide subgraphs <10 nodes` is on by default and already trims it.
- No Python at all: open `app/index.html` directly in the browser. It then reads the last
  event that was prepared, embedded in `app/js/bundle.js`, `rechits.js` and
  `associations.js`, with no server.
