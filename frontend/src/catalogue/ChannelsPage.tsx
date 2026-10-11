import { useState } from "react";
import { Link } from "react-router-dom";

import type { Channel } from "../api/client";
import { Button, type Column, DataTable, Section } from "../design/components";
import { CONFIDENCE, sentenceCase, systemName } from "./catalogue";
import { ChannelsEdit } from "./DraftEdits";
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
  const columns: Column<Channel>[] = [
    {
      id: "channel",
      header: "Channel",
      rowHeader: true,
      bidi: true,
      cell: (channel) => (
        <>
          <span className="cat-name">{channel.name}</span>
          {(channel.kind || channel.confidence) && (
            <span className="cat-detail">
              {[channel.kind ? sentenceCase(channel.kind) : null, channel.confidence ? CONFIDENCE[channel.confidence] : null].filter(Boolean).join(" · ")}
            </span>
          )}
          {channel.description && <span className="cat-detail" dir="auto">{channel.description}</span>}
        </>
      ),
    },
    {
      id: "entry",
      header: "Orders enter through",
      cell: (channel) =>
        channel.entry_system_id ? (
          <Link to={`${base}/systems/${encodeURIComponent(channel.entry_system_id)}`} dir="auto">
            {systemName(book, channel.entry_system_id)}
          </Link>
        ) : (
          <span className="cat-quiet">No system is named</span>
        ),
    },
    {
      id: "orders",
      header: "Can be ordered through it",
      cell: (channel) => {
        const through = orders(channel.id);
        return through.length ? (
          <ul className="cat-plain">
            {through.map(({ offering, types }) => (
              <li key={offering.id}>
                <Link to={`${base}/offerings/${encodeURIComponent(offering.id)}`} dir="auto">{offering.name}</Link>
                <span className="cat-detail" dir="auto">{types.map((type) => type.name).join(" · ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="cat-quiet">No order type names it</span>
        );
      },
    },
  ];
  return (
    <Section
      title="Where orders are placed"
      count={channels.length}
      actions={editable && !editing ? <Button aria-expanded={false} onClick={() => setEditing(true)}>Edit the channels</Button> : undefined}
    >
      <p className="cat-lead">The system that takes each channel’s orders in, and what can be ordered through it.</p>
      {editing ? (
        <ChannelsEdit onDone={() => setEditing(false)} />
      ) : (
        <DataTable
          caption="Channels in this version"
          captionHidden
          columns={columns}
          rows={channels}
          rowId={(channel) => channel.id}
          emptyText="This version names no channel."
        />
      )}
    </Section>
  );
}
