import {
  createAspirationTemplateCsv,
  exportProjectJson,
  getMappingExportFilename,
  generateMappingCsvFiles,
  importProjectJson,
  parseAspirationTemplateCsv,
} from '../utils/janusFiles';
import type { ExperimentProject } from '../types';

const baseProject: ExperimentProject = {
  experimentName: 'ExpA',
  globalDeadVolume: 2,
  useGlobalDeadVolume: true,
  mixLossEnabled: true,
  protocolComponents: [
    {
      id: 'comp-buffer',
      name: 'Buffer',
      transferVolume: 2,
      color: '#006d77',
      deadVolumeMode: 'global',
      customDeadVolume: null,
      subItems: [],
    },
  ],
  aspirationPlates: [
    {
      id: 'asp-1',
      name: 'Asp1',
      kind: 'aspiration',
      labware: 'plate-96',
      wells: {
        A1: {
          sourceId: 'comp-buffer',
          sourceType: 'component',
          displayName: 'Buffer',
          componentId: 'comp-buffer',
          parentColor: '#006d77',
          wellLabel: 'Buffer source',
        },
      },
    },
  ],
  dispensingPlate: {
    id: 'dsp-1',
    name: 'Disp1',
    kind: 'dispensing',
    labware: 'plate-96',
    wells: {
      B1: {
        wellName: 'Sample_1',
        items: [
          {
            sourceId: 'comp-buffer',
            sourceType: 'component',
            displayName: 'Buffer',
            componentId: 'comp-buffer',
            parentColor: '#006d77',
          },
        ],
      },
    },
  },
  mappingSplitGroups: [],
};

describe('janus files', () => {
  test('parses aspiration template rows', () => {
    const rows = parseAspirationTemplateCsv('well,component,item_name,well_label\nA1,Primer,Mu_F1_F,Primer 1');

    expect(rows).toEqual([
      {
        well: 'A1',
        component: 'Primer',
        itemName: 'Mu_F1_F',
        wellLabel: 'Primer 1',
      },
    ]);
  });

  test('creates aspiration template csv header', () => {
    expect(createAspirationTemplateCsv()).toContain('well,component,item_name,well_label');
  });

  test('round-trips project json export and import', () => {
    const text = exportProjectJson(baseProject);
    const imported = importProjectJson(text);

    expect(imported.experimentName).toBe('ExpA');
    expect(imported.aspirationPlates[0].name).toBe('Asp1');
  });

  test('generates mapping csv with component column when well names exist', () => {
    const files = generateMappingCsvFiles(baseProject);

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('ExpA_Disp1_Janus_mapping_file.csv');
    expect(files[0].content).toContain('Component,Asp. Rack,Asp. Posi,Dsp. Rack,Dsp. Posi,vol');
    expect(files[0].content).toContain('Sample_1,Asp1,A1,Disp1,B1,2');
  });

  test('splits mapping files by aspiration group', () => {
    const project: ExperimentProject = {
      ...baseProject,
      aspirationPlates: [
        ...baseProject.aspirationPlates,
        {
          id: 'asp-2',
          name: 'Asp2',
          kind: 'aspiration',
          labware: 'rack-4x6',
          wells: {
            A1: {
              sourceId: 'item-primer',
              sourceType: 'item',
              displayName: 'Mu_F1_F',
              componentId: 'comp-buffer',
              parentColor: '#006d77',
              wellLabel: '',
            },
          },
        },
      ],
      dispensingPlate: {
        ...baseProject.dispensingPlate,
        wells: {
          B1: baseProject.dispensingPlate.wells.B1,
          B2: {
            wellName: 'Sample_2',
            items: [
              {
                sourceId: 'item-primer',
                sourceType: 'item',
                displayName: 'Mu_F1_F',
                componentId: 'comp-buffer',
                parentColor: '#006d77',
              },
            ],
          },
        },
      },
      mappingSplitGroups: [
        {
          id: 'group-1',
          plateIds: ['asp-1'],
        },
        {
          id: 'group-2',
          plateIds: ['asp-2'],
        },
      ],
    };

    const files = generateMappingCsvFiles(project);

    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe('ExpA_Disp1_from_Asp1_Janus_mapping_file.csv');
    expect(files[1].filename).toBe('ExpA_Disp1_from_Asp2_Janus_mapping_file.csv');
  });

  test('builds filenames from experiment, dispensing, and aspiration group names', () => {
    expect(getMappingExportFilename('ExpA', 'Disp1', ['Asp1', 'Asp2'])).toBe(
      'ExpA_Disp1_from_Asp1-Asp2_Janus_mapping_file.csv',
    );
  });
});
