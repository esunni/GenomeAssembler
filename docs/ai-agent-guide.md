# GenomeAssembler: AI Agent Onboarding Guide

Welcome! If you are an AI agent analyzing or modifying this repository, this document will provide you with the critical context needed to understand the project structure, domain logic, and technical stack.

## 1. Project Overview

**GenomeAssembler** is a client-side React application designed to assist researchers in assembling circular genomes. It streamlines the transition from *in silico* design to *in vitro* automated lab execution.

The application serves two distinct workflows:
1. **Design Phase (Fragment Design):** Analyzing circular genomes (FASTA files) and planning Type IIS restriction enzyme cutting sites.
2. **Build Phase (Janus Reaction Setup):** Configuring the exact liquid handling protocols to physically build these fragments using an automated pipetting robot (specifically targeting PerkinElmer Janus liquid handlers).

There is no backend; the application runs entirely in the browser and handles state locally. Projects can be exported and imported as JSON. 

It is deployed automatically to GitHub Pages via GitHub Actions upon pushing to the `janus-github-pages` branch.

## 2. Tech Stack

- **Framework:** React 19 + Vite
- **Language:** TypeScript
- **Testing:** Vitest + React Testing Library + jsdom
- **Styling:** Vanilla CSS (`src/styles.css`)
- **Package Manager:** npm

## 3. Core Workflows & Domain Logic

### A. The "Design" Workflow (Fragment Design)
- **Goal:** Upload a circular or linear genome sequence, detect recognition sites for Type IIS enzymes (like BsaI, BsmBI), and visually plan the fragmentation strategy.
- **Features:**
  - **Search Window Finding:** Automatically identifies optimal 30bp overlapping regions for fragment assembly based on user constraints (promoter regions, CDS conservation/intergenic preference, and silent mutations).
  - **Silent Mutation Analysis:** Detects internal restriction enzyme sites and suggests silent mutations based on codon usage frequencies and CDS reading frames to eliminate unwanted sites without changing amino acids.
  - **Primer Design:** Generates sequences for vector backbones, fragment assembly, and mutation incorporation. Calculates Tm and visualizes primer binding against templates.
- **Key Components:** `DesignPage.tsx`, `CircularGenomeMap.tsx`, `LinearGenomeMap.tsx`, `SearchWindowFinder.tsx`, `SilentMutationAnalysis.tsx`, `PrimerDesignSection.tsx`
- **Key Utilities:** 
  - `src/utils/designTools.ts` (handles FASTA parsing and circular enzyme site calculations).
  - `src/utils/searchWindowTools.ts` (calculates optimal cut regions).
  - `src/utils/mutationTools.ts` (CDS analysis and silent mutation recommendation).
  - `src/utils/primerDesign.ts` (primer Tm and sequence generation).

### B. The "Build" Workflow (Janus Mapping File Generator)
- **Goal:** Set up a protocol for a liquid handling robot to perform the assembly reactions.
- **Concepts:**
  - **Protocol Components:** The chemical ingredients (Buffers, Primers, DNA templates, enzymes). They can have dead volume configurations or be part of a "Premix" (combined master mix).
  - **Aspiration Plates:** Source labware (e.g., `plate-96`, `rack-4x6`) where the components are drawn from. Wells are assigned specific components.
  - **Dispensing Plates:** Destination labware where the assembly reactions take place.
  - **Dead Volume & Remainder:** Advanced calculations to ensure the robot always has enough extra volume to avoid drawing air.
- **Key Components:** `ReactionSetupSection.tsx`, `AspirationPlatesSection.tsx`, `DispensingPlateSection.tsx`
- **Key Utilities:** 
  - `src/utils/janusState.ts`: Business logic for calculating volumes, generating preparation summaries, and managing state IDs.
  - `src/utils/janusFiles.ts`: Logic to serialize the project to JSON and, most importantly, generate the `CSV` mapping files the Janus software requires to execute the run.

## 4. Codebase Structure

```text
src/
├── components/          # UI Components
│   ├── DesignPage.tsx   # Entry for Fragment Design
│   ├── ReactionSetupSection.tsx  # Defines reagents
│   ├── AspirationPlatesSection.tsx # Defines source labware
│   ├── DispensingPlateSection.tsx  # Defines target labware
│   ├── SearchWindowFinder.tsx    # Optimal cut window logic
│   ├── SilentMutationAnalysis.tsx # Silent mutation detection
│   └── PrimerDesignSection.tsx   # Primer generation
├── utils/               # Pure functions & Domain logic
│   ├── designTools.ts   # Sequence algorithms
│   ├── janusFiles.ts    # I/O (Export JSON/CSV)
│   ├── janusState.ts    # Calculators for volumes/mixes
│   ├── searchWindowTools.ts # Cut site algorithms
│   ├── mutationTools.ts # Codon and CDS algorithms
│   └── primerDesign.ts  # Tm and primer logic
├── App.tsx              # Main orchestrator; holds global state
├── types.ts             # Domain models (ExperimentProject, ProtocolComponent, etc.)
└── styles.css           # Global stylesheet
```

## 5. Architectural Guidelines for AI Agents

When modifying this repository, adhere to the following rules:

1. **State Management:** The global state is represented by the `ExperimentProject` interface (defined in `types.ts`). It is held in `App.tsx`. Component state is typically lifted up. Avoid adding unnecessary local states if the data belongs in the global project export.
2. **Immutability:** When modifying the `project` state using the `onProjectChange` prop, always use immutable update patterns (creating new array/object references).
3. **Wet-Lab Context:** Pay attention to lab automation terms. "Well", "Plate", "Aspiration" (drawing liquid), and "Dispensing" (releasing liquid) are physical actions. Dead volumes are critical safety margins for pipetting robots—do not remove or bypass dead volume calculations.
4. **Testing:** Write tests using Vitest. Component tests should reside alongside the component (`[ComponentName].test.tsx`). Pure logic should be tested in `src/__tests__/`.
5. **Types First:** Update `src/types.ts` before modifying any component logic that touches the core data model.

You are now ready to assist with GenomeAssembler!