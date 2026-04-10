import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { AspirationPlatesSection } from './AspirationPlatesSection';
import { createAspirationPlate, createDefaultProject, buildAvailableSources } from '../utils/janusState';
import { ExperimentProject } from '../types';

describe('AspirationPlatesSection', () => {
  test('autofill uses interval to skip n wells', async () => {
    const user = userEvent.setup();
    let project = createDefaultProject();
    
    // Setup a project with 1 aspiration plate
    const plate = createAspirationPlate();
    plate.id = 'plate-1';
    plate.labware = 'plate-96';
    project.aspirationPlates = [plate];

    // Setup a component with 2 items
    project.protocolComponents = [
      {
        id: 'comp-1',
        name: 'Component 1',
        transferVolume: 10,
        color: '#FF0000',
        deadVolumeMode: 'global',
        customDeadVolume: null,
        subItems: [
          { id: 'item-1', name: 'Item 1' },
          { id: 'item-2', name: 'Item 2' },
        ],
      },
    ];

    const availableSources = buildAvailableSources(project);
    const onProjectChange = vi.fn((updater) => {
      project = updater(project);
    });

    const { rerender } = render(
      <AspirationPlatesSection
        project={project}
        availableSources={availableSources}
        onProjectChange={onProjectChange}
        onDownloadTextFile={vi.fn()}
      />
    );

    // Set Interval to 1
    const intervalInput = screen.getByLabelText(/Interval/i);
    await user.clear(intervalInput);
    await user.type(intervalInput, '1');

    // Click Autofill
    const autofillButton = screen.getByRole('button', { name: /Autofill/i });
    await user.click(autofillButton);

    // Re-render with new project state
    rerender(
      <AspirationPlatesSection
        project={project}
        availableSources={availableSources}
        onProjectChange={onProjectChange}
        onDownloadTextFile={vi.fn()}
      />
    );

    // Check that wells A1 and A3 are filled (interval of 1 means 1 well skipped)
    // Actually, we can just check the project state that was updated.
    const wells = project.aspirationPlates[0].wells;
    expect(wells).toHaveProperty('A1');
    expect(wells).not.toHaveProperty('A2');
    expect(wells).toHaveProperty('A3');
    
    expect(wells['A1'].displayName).toBe('Item 1');
    expect(wells['A3'].displayName).toBe('Item 2');
  });
});
