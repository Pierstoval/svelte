import Wrapper from './shared/Wrapper.ts';
import AwaitBlock from './AwaitBlock.ts';
import Body from './Body.ts';
import DebugTag from './DebugTag.ts';
import EachBlock from './EachBlock.ts';
import Element from './Element/index.ts';
import Head from './Head.ts';
import IfBlock from './IfBlock.ts';
import InlineComponent from './InlineComponent/index.ts';
import MustacheTag from './MustacheTag.ts';
import RawMustacheTag from './RawMustacheTag.ts';
import Slot from './Slot.ts';
import Text from './Text.ts';
import Title from './Title.ts';
import Window from './Window.ts';
import { INode } from '../../nodes/interfaces.ts';
import Renderer from '../Renderer.ts';
import Block from '../Block.ts';
import { trim_start, trim_end } from '../../../utils/trim.ts';
import { link } from '../../../utils/link.ts';
import { Identifier } from 'estree';

const wrappers = {
	AwaitBlock,
	Body,
	Comment: null,
	DebugTag,
	EachBlock,
	Element,
	Head,
	IfBlock,
	InlineComponent,
	MustacheTag,
	Options: null,
	RawMustacheTag,
	Slot,
	Text,
	Title,
	Window
};

function trimmable_at(child: INode, next_sibling: Wrapper): boolean {
	// Whitespace is trimmable if one of the following is true:
	// The child and its sibling share a common nearest each block (not at an each block boundary)
	// The next sibling's previous node is an each block
	return (next_sibling.node.find_nearest(/EachBlock/) === child.find_nearest(/EachBlock/)) || next_sibling.node.prev.type === 'EachBlock';
}

export default class FragmentWrapper {
	nodes: Wrapper[];

	constructor(
		renderer: Renderer,
		block: Block,
		nodes: INode[],
		parent: Wrapper,
		strip_whitespace: boolean,
		next_sibling: Wrapper
	) {
		this.nodes = [];

		let last_child: Wrapper;
		let window_wrapper;

		let i = nodes.length;
		while (i--) {
			const child = nodes[i];

			if (!child.type) {
				throw new Error(`missing type`);
			}

			if (!(child.type in wrappers)) {
				throw new Error(`TODO implement ${child.type}`);
			}

			// special case — this is an easy way to remove whitespace surrounding
			// <svelte:window/>. lil hacky but it works
			if (child.type === 'Window') {
				window_wrapper = new Window(renderer, block, parent, child);
				continue;
			}

			if (child.type === 'Text') {
				let { data } = child;

				// We want to remove trailing whitespace inside an element/component/block,
				// *unless* there is no whitespace between this node and its next sibling
				if (this.nodes.length === 0) {
					const should_trim = (
						next_sibling ? (next_sibling.node.type === 'Text' && /^\s/.test(next_sibling.node.data) && trimmable_at(child, next_sibling)) : !child.has_ancestor('EachBlock')
					);

					if (should_trim) {
						data = trim_end(data);
						if (!data) continue;
					}
				}

				// glue text nodes (which could e.g. be separated by comments) together
				if (last_child && last_child.node.type === 'Text') {
					(last_child as Text).data = data + (last_child as Text).data;
					continue;
				}

				const wrapper = new Text(renderer, block, parent, child, data);
				if (wrapper.skip) continue;

				this.nodes.unshift(wrapper);

				link(last_child, last_child = wrapper);
			} else {
				const Wrapper = wrappers[child.type];
				if (!Wrapper) continue;

				const wrapper = new Wrapper(renderer, block, parent, child, strip_whitespace, last_child || next_sibling);
				this.nodes.unshift(wrapper);

				link(last_child, last_child = wrapper);
			}
		}

		if (strip_whitespace) {
			const first = this.nodes[0] as Text;

			if (first && first.node.type === 'Text') {
				first.data = trim_start(first.data);
				if (!first.data) {
					first.var = null;
					this.nodes.shift();

					if (this.nodes[0]) {
						this.nodes[0].prev = null;
					}
				}
			}
		}

		if (window_wrapper) {
			this.nodes.unshift(window_wrapper);
			link(last_child, window_wrapper);
		}
	}

	render(block: Block, parent_node: Identifier, parent_nodes: Identifier) {
		for (let i = 0; i < this.nodes.length; i += 1) {
			this.nodes[i].render(block, parent_node, parent_nodes);
		}
	}
}
