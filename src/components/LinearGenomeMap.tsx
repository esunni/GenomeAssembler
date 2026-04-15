import React, { useMemo } from 'react';
import { CdsRegion, SiteAnalysis } from '../utils/mutationTools';
import { Promoter, SearchWindow } from '../utils/searchWindowTools';

interface LinearGenomeMapProps {
  sequenceLength: number;
  cdsRegions: CdsRegion[];
  promoters: Promoter[];
  searchWindows: SearchWindow[];
  siteAnalyses: SiteAnalysis[];
  isLinear?: boolean;
}

export function LinearGenomeMap({ 
  sequenceLength, 
  cdsRegions, 
  promoters, 
  searchWindows,
  siteAnalyses,
  isLinear
}: LinearGenomeMapProps) {
  
  // Create calculated fragments based on search windows
  const fragments = useMemo(() => {
    if (searchWindows.length === 0) return [];
    
    // Sort windows by start position
    const sortedWindows = [...searchWindows].sort((a, b) => a.start - b.start);
    const frags = [];
    let fragIndex = 1;
    
    if (isLinear && sortedWindows.length > 0 && sortedWindows[0].start > 1) {
      frags.push({
        id: `frag-${fragIndex++}`,
        start: 1,
        end: sortedWindows[0].start - 1,
        wrapsAround: false
      });
    }

    for (let i = 0; i < sortedWindows.length; i++) {
      const current = sortedWindows[i];
      let end = sequenceLength;
      let wrapsAround = false;

      if (i < sortedWindows.length - 1) {
        const next = sortedWindows[i + 1];
        end = next.start - 1 < 0 ? sequenceLength - 1 : next.start - 1;
        wrapsAround = next.start <= current.start;
      } else if (!isLinear) {
        const next = sortedWindows[0];
        end = next.start - 1 < 0 ? sequenceLength - 1 : next.start - 1;
        wrapsAround = next.start <= current.start;
      }
      
      frags.push({
        id: `frag-${fragIndex++}`,
        start: current.start,
        end,
        wrapsAround
      });
    }
    return frags;
  }, [searchWindows, sequenceLength, isLinear]);

  const mapScale = (pos: number) => `${(pos / sequenceLength) * 100}%`;
  
  const renderTrackRegion = (
    start: number, 
    end: number, 
    color: string, 
    height = '12px', 
    top = '50%', 
    transform = 'translateY(-50%)',
    opacity = 1,
    title = ''
  ) => {
    if (end >= start) {
      return (
        <div 
          title={title}
          style={{
            position: 'absolute',
            left: mapScale(start),
            width: mapScale(end - start + 1),
            height,
            top,
            transform,
            backgroundColor: color,
            opacity,
            borderRadius: '2px',
            cursor: 'help'
          }} 
        />
      );
    } else {
      // Wraps around
      return (
        <>
          <div 
            title={title}
            style={{
              position: 'absolute',
              left: mapScale(start),
              width: mapScale(sequenceLength - start + 1),
              height,
              top,
              transform,
              backgroundColor: color,
              opacity,
              borderRadius: '2px 0 0 2px',
              cursor: 'help'
            }} 
          />
          <div 
            title={title}
            style={{
              position: 'absolute',
              left: 0,
              width: mapScale(end),
              height,
              top,
              transform,
              backgroundColor: color,
              opacity,
              borderRadius: '0 2px 2px 0',
              cursor: 'help'
            }} 
          />
        </>
      );
    }
  };

  const renderPoint = (pos: number, color: string, icon: string, title: string) => {
    return (
      <div 
        title={title}
        style={{
          position: 'absolute',
          left: mapScale(pos),
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'help',
          zIndex: 10
        }}
      >
        <div style={{ color, fontSize: '18px', lineHeight: 1 }}>{icon}</div>
      </div>
    );
  };

  return (
    <div style={{ padding: '1rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--line-subtle)', marginTop: '2rem' }}>
      <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem' }}>Linear Genome Map</h3>
      
      <div style={{ position: 'relative', height: '140px', padding: '10px 0' }}>
        
        {/* Track 1: Mutations & Promoters */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30px' }}>
          <div style={{ position: 'absolute', left: '-120px', width: '110px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>Mutations / Promoters</div>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {promoters.map((p, i) => (
              <div key={`p-${i}`} style={{ position: 'absolute', left: mapScale(p.position), top: '50%', transform: 'translate(-50%, -50%)', zIndex: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            ))}
            {siteAnalyses.map((site, i) => (
              <div key={`m-${i}`} style={{ position: 'absolute', left: mapScale(site.sitePosition), top: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
                <div style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', border: '1px solid white' }} title={`Mutation site at ${site.sitePosition}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Track 2: CDS / ORFs */}
        <div style={{ position: 'absolute', top: '35px', left: 0, right: 0, height: '24px' }}>
          <div style={{ position: 'absolute', left: '-120px', width: '110px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--muted-foreground)', top: '4px' }}>CDS / ORFs</div>
          <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--line-subtle)', borderRadius: '4px' }}>
            {cdsRegions.map((cds, i) => renderTrackRegion(cds.start, cds.end, '#a855f7', '16px', '50%', 'translateY(-50%)', 0.8, `CDS ${cds.id}: ${cds.start}-${cds.end}`))}
          </div>
        </div>

        {/* Track 3: Fragments & Windows */}
        <div style={{ position: 'absolute', top: '75px', left: 0, right: 0, height: '40px' }}>
          <div style={{ position: 'absolute', left: '-120px', width: '110px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--muted-foreground)', top: '10px' }}>Fragments & Windows</div>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Fragments alternating colors */}
            {fragments.map((frag, i) => {
              const color = i % 2 === 0 ? '#3b82f6' : '#8b5cf6';
              return renderTrackRegion(frag.start, frag.end, color, '8px', '50%', 'translateY(-50%)', 0.3, `Fragment ${frag.id}`);
            })}
            
            {/* Search Windows */}
            {searchWindows.map((win, i) => {
              const color = win.reason === 'promoter' ? '#f59e0b' : win.reason === 'intergenic' ? '#10b981' : win.reason === 'silent_mutation' ? '#ef4444' : '#64748b';
              return renderTrackRegion(win.start, win.end, color, '24px', '50%', 'translateY(-50%)', 1, `Window ${i+1}: ${win.start}-${win.end} (${win.reason})`);
            })}
          </div>
        </div>

        {/* Axis / Ruler */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20px', borderTop: '1px solid var(--line-strong)' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <div key={pct} style={{ position: 'absolute', left: `${pct * 100}%`, transform: 'translateX(-50%)', fontSize: '0.7rem', color: 'var(--muted-foreground)', paddingTop: '4px' }}>
              {Math.round(sequenceLength * pct)}
            </div>
          ))}
          {[0.125, 0.375, 0.625, 0.875].map((pct) => (
            <div key={pct} style={{ position: 'absolute', left: `${pct * 100}%`, width: '1px', height: '4px', background: 'var(--line-strong)', top: 0 }} />
          ))}
        </div>

      </div>

      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1.5rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', background: '#a855f7', borderRadius: '2px', opacity: 0.8 }}></div> CDS Region</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Promoter</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '50%' }}></div> Silent Mutation</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '2px' }}></div> Intergenic Window</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '2px' }}></div> Promoter Window</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '2px' }}></div> Mutation Window</div>
      </div>
    </div>
  );
}