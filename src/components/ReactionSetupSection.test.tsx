import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactionSetupSection } from './ReactionSetupSection';
import { ExperimentProject } from '../types';

describe('ReactionSetupSection', () => {
  const mockProject: ExperimentProject = {
    experimentName: 'Test Project',
    globalDeadVolume: 10,
    useGlobalDeadVolume: true,
    aspirationPlates: [],
    dispensingPlate: { id: 'disp-1', name: 'Dispensing', kind: 'dispensing', labware: 'plate-96', wells: {} },
    remainderConfig: { enabled: false, fixedComponentId: null, remainderComponentId: null, targetReactionVolume: '', manualBatchVolume: '', dnaConcentration: '' },
    mappingSplitGroups: [],
    protocolComponents: [
      {
        id: 'comp-1',
        name: 'Test Component',
        transferVolume: 5,
        deadVolumeMode: 'global',
        customDeadVolume: null,
        subItems: [],
        color: '#ff0000',
        isPremixComponent: false,
      }
    ]
  };

  const mockOnProjectChange = vi.fn();

  it('appends generated subitems and can clear them', async () => {
    const user = userEvent.setup();
    let currentProject = mockProject;

    mockOnProjectChange.mockImplementation((updater) => {
      currentProject = updater(currentProject);
    });

    const { rerender } = render(
      <ReactionSetupSection
        project={currentProject}
        bulkProtocolText=""
        onBulkProtocolTextChange={() => {}}
        onImportProtocolPaste={() => {}}
        onProjectChange={mockOnProjectChange}
      />
    );

    // Expand the subitems section
    const expandButton = screen.getAllByRole('button', { name: /Expand/i })[0];
    await user.click(expandButton);

    // Check we have the Generate button
    const generateBtn = screen.getByRole('button', { name: /Generate/i });
    
    // Setup inputs: Start 1, End 2
    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    const endInput = screen.getByLabelText('End') as HTMLInputElement;

    // By default they should be 1 and 3. Let's make end 2.
    await user.clear(endInput);
    await user.type(endInput, '2');

    // Generate first batch
    await user.click(generateBtn);

    expect(mockOnProjectChange).toHaveBeenCalled();
    expect(currentProject.protocolComponents[0].subItems).toHaveLength(2);
    expect(currentProject.protocolComponents[0].subItems[0].name).toBe('1');
    expect(currentProject.protocolComponents[0].subItems[1].name).toBe('2');

    // Re-render with new project state
    rerender(
      <ReactionSetupSection
        project={currentProject}
        bulkProtocolText=""
        onBulkProtocolTextChange={() => {}}
        onImportProtocolPaste={() => {}}
        onProjectChange={mockOnProjectChange}
      />
    );

    // Generate second batch to test append
    await user.clear(startInput);
    await user.type(startInput, '3');
    await user.clear(endInput);
    await user.type(endInput, '4');
    
    await user.click(generateBtn);

    expect(currentProject.protocolComponents[0].subItems).toHaveLength(4);
    expect(currentProject.protocolComponents[0].subItems[2].name).toBe('3');
    expect(currentProject.protocolComponents[0].subItems[3].name).toBe('4');

    rerender(
      <ReactionSetupSection
        project={currentProject}
        bulkProtocolText=""
        onBulkProtocolTextChange={() => {}}
        onImportProtocolPaste={() => {}}
        onProjectChange={mockOnProjectChange}
      />
    );

    // Now clear subitems
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    await user.click(clearBtn);

    expect(currentProject.protocolComponents[0].subItems).toHaveLength(0);
    
    // Test that the input was reset (e.g. End input goes back to default or empty if we clear the state)
    // The requirement says "resets inputs", which means start goes back to 1 and end goes back to 3, since we delete the state.
    expect(screen.getByLabelText('Start')).toHaveValue(1);
    expect(screen.getByLabelText('End')).toHaveValue(3);
  });

  it('allows backspacing to clear Start/End inputs', async () => {
    const user = userEvent.setup();
    render(
      <ReactionSetupSection
        project={mockProject}
        bulkProtocolText=""
        onBulkProtocolTextChange={() => {}}
        onImportProtocolPaste={() => {}}
        onProjectChange={mockOnProjectChange}
      />
    );

    const expandButton = screen.getAllByRole('button', { name: /Expand/i })[0];
    await user.click(expandButton);

    const startInput = screen.getByLabelText('Start');
    await user.clear(startInput);

    expect(startInput).toHaveValue(null); // or empty string
  });

  it('allows drag-and-drop reordering of subitems', async () => {
    const user = userEvent.setup();
    let currentProject = {
      ...mockProject,
      protocolComponents: [
        {
          ...mockProject.protocolComponents[0],
          subItems: [
            { id: 'item-1', name: 'Item 1' },
            { id: 'item-2', name: 'Item 2' },
            { id: 'item-3', name: 'Item 3' }
          ]
        }
      ]
    };

    const localMockOnProjectChange = vi.fn().mockImplementation((updater) => {
      currentProject = updater(currentProject);
    });

    render(
      <ReactionSetupSection
        project={currentProject}
        bulkProtocolText=""
        onBulkProtocolTextChange={() => {}}
        onImportProtocolPaste={() => {}}
        onProjectChange={localMockOnProjectChange}
      />
    );

    // Expand the subitems section to ensure they are visible
    const expandButton = screen.getAllByRole('button', { name: /Expand/i })[0];
    await user.click(expandButton);

    const item1 = screen.getByText('Item 1');
    const item3 = screen.getByText('Item 3');

    fireEvent.dragStart(item1);
    fireEvent.dragOver(item3);
    fireEvent.drop(item3);

    expect(localMockOnProjectChange).toHaveBeenCalled();
    expect(currentProject.protocolComponents[0].subItems.map(i => i.name)).toEqual(['Item 2', 'Item 3', 'Item 1']);
  });
});
