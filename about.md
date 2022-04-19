## Inspiration

In drug discovery and drug repurposing, interactions between objects are significant. Graph (network) based inference can use and expose these interactions pretty efficiently. The graph-based inference is based on the topology of the graph. In addition to the topology, the attributes of objects can also play an important role in the analysis. As a result, benefiting from both the topological properties of the graph and data attributes can give the best results.

## What it does

- Search **ANY** `string` attribute inside the TigerGraph database easily.
- Filter attributes and types on `string` search.
- Search also in client-side data to highlight in the user interface.
- Run 'Interpreted' and 'Installed' GSQL queries.
- Inspect attributes of a vertex/edge.
- Inspect attributes of multiple vertices and edges as a table.
- Dynamically resize graph canvas.
- Save and load data as JSON for visualization.
- Summarize crowded neighborhoods with containers to make visualization more readable
- Go back and forward on the history of the graph.
- Get [Adamic-Adar](https://en.wikipedia.org/wiki/Adamic%E2%80%93Adar_index) values of a vertex to all other visible nodes to predict connections.
- Get [Jaccard similarity](https://en.wikipedia.org/wiki/Jaccard_index) of a vertex to all other vertices in the **whole database**. Here Jaccard similarity is defined as (count of the intersection of **1-neighborhood**) / (count of the union of **1-neighborhood**).
- Get [inchi](https://en.wikipedia.org/wiki/International_Chemical_Identifier) similarity of a _Compound_ to all other visible _Compound_. Here similary of inchi values are calculated with edit distance algorithm.
- Bring neighbors of a vertex from a specific type.

## How we built it

Firstly, we created dataset. To create dataset, we used Python and Jupyter notebook and [pyTigerGraph](https://github.com/pyTigerGraph/pyTigerGraph) library. Implementation of creating dataset, creating data schema and inserting to TigerGraph is available [inside another repository called "derman"](https://github.com/canbax/derman). Derman also contains all the data as text [inside a compressed file](https://github.com/canbax/derman/blob/main/data.7z). So you can recreate your own database.

To generate the database We used [the DRKG dataset](https://github.com/gnn4dr/DRKG). Then we enriched this with [DGIDB](https://dgidb.org/) and [hetionet](https://github.com/hetio/hetionet) datasets. Basically, we merged these 3 datasets to create an extensive dataset.

We used [Angular](https://angular.io/) and [Angular Material](https://material.angular.io/) in the frontend.

## Challenges we ran into

- Understanding the domain was difficult. We read lots of papers and get help from Molecular Biolog friends.
- Creating a useful and understandable dataset was hard. The DRKG was a knowledge graph dataset. So it doesn't contain and data properties . We wanted to use both data properties such as International Chemical Identifier (inchi) and also the topology of the graph. That's why we enriched the DRKG with 'hetionet' and 'DGIDB' datasets.

## Accomplishments that we're proud of

- Original and generic (schema-agnostic) GSQL algorithms such as `adamicAdar`, `editDistance`, and `jaccardSimilarity`.
- Domain-specific GSQL algorithm `inchiSimilarity`
- Generic (schema-agnostic) way to search for **ANY** `string` inside the database.
- A resizeable graph canvas for easy interaction using User-Interface.
- With the help of [compound nodes](https://js.cytoscape.org/#notation/compound-nodes), make complex graphs a lot more readable.

## What we learned

- Powerful GSQL features such as dynamic arrays
- Using Tiger Graph with Docker
- A little knowledge about drug discovery

## What's next for Dervish

- Many different algorithms can be used to find similarities or connections between diseases and/or compounds.
- More collaboration with domain experts can make the tool more user-friendly
