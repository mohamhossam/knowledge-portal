import { useState } from "react";
import { Link } from "react-router-dom";

import { CONFIDENCE, sentenceCase, systemName } from "./catalogue";
import { ChannelsEdit, EditButton } from "./DraftEdits";
import { useCatalogueContext } from "./useCatalogue";

/**
 * Where orders are placed: each channel, the system that takes its orders in,
 * and the order types that can be placed through it (requirement-portal ADR-0101).
 */
export function ChannelsPage() {
  const { book, base, editable } = useCatalogueContext();
  const [editing, setEditing] = useState(false);
  const channels = book.release.channels ?? [];
  /** Per offering, the order types that can be placed through the channel. */
  const orders = (channelId: string) =>
    (book.release.products ?? [])
      .map((offering) => ({ offering, types: offering.order_types.filter((type) => (type.channels ?? []).includes(channelId)) }))
      .filter((item) => item.types.length > 0);
  return (
    <section className="govsection catalogue__first" aria-labelledby="channels-title">
      <h2 id="channels-title" className="govsection__title">Channels</h2>
      <p className="govsection__lead">
        Where orders are placed, the system that takes each channel’s orders in, and what can be ordered through it.
      </p>
      {editable && !editing && (
        <p className="govsection__actions">
          <EditButton onClick={() => setEditing(true)}>Edit the channels</EditButton>
        </p>
      )}
      {editing ? (
        <ChannelsEdit onDone={() => setEditing(false)} />
      ) : channels.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Channels in this version</caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Orders enter through</th>
              <th scope="col">Can be ordered through it</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => {
              const through = orders(channel.id);
              return (
                <tr key={channel.id} className="row">
                  <th scope="row" dir="auto">
                    {channel.name}
                    {(channel.kind || channel.confidence) && (
                      <span className="secondary govtable__by">
                        {[channel.kind ? sentenceCase(channel.kind) : null, channel.confidence ? CONFIDENCE[channel.confidence] : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {channel.description && <span className="secondary govtable__by" dir="auto">{channel.description}</span>}
                  </th>
                  <td>
                    {channel.entry_system_id ? (
                      <Link to={`${base}/systems/${encodeURIComponent(channel.entry_system_id)}`} dir="auto">
                        {systemName(book, channel.entry_system_id)}
                      </Link>
                    ) : (
                      <span className="secondary">No system is named</span>
                    )}
                  </td>
                  <td>
                    {through.length ? (
                      <ul className="sheet__roles">
                        {through.map(({ offering, types }) => (
                          <li key={offering.id}>
                            <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}`} dir="auto">{offering.name}</Link>
                            <span className="secondary govtable__by" dir="auto">{types.map((type) => type.name).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="secondary">No order type names it</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">This version names no channel.</p>
      )}
    </section>
  );
}
