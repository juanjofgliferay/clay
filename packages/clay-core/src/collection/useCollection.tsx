/**
 * SPDX-FileCopyrightText: © 2022 Liferay, Inc. <https://liferay.com>
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React, {useCallback, useContext, useMemo, useRef} from 'react';

import {excludeProps, getKey} from './utils';

import type {
	ChildElement,
	CollectionState,
	ICollectionProps,
	Props,
} from './types';

type ItemLoc = {
	prevKey?: React.Key;
	nextKey?: React.Key;
};

type LayoutValue = {
	index: number;
	value: string;
};

type CollectionContextProps = {
	layout: React.MutableRefObject<Map<React.Key, LayoutValue>>;
	keys: React.MutableRefObject<Map<React.Key, ItemLoc>>;
};

const CollectionContext = React.createContext({} as CollectionContextProps);

const SECTION_NAMES = ['Group', 'Section'];

export function useCollection<
	T extends Record<any, any>,
	P = unknown,
	K = unknown
>({
	children,
	exclude,
	filter,
	filterKey,
	itemContainer: ItemContainer,
	items,
	notFound,
	parentKey,
	passthroughKey = true,
	publicApi,
	suppressTextValueWarning = true,
	virtualizer,
}: ICollectionProps<T, P> & Props<P, K>): CollectionState {
	const {layout: parentLayout} = useContext(CollectionContext);

	const layoutRef = useRef<Map<React.Key, LayoutValue>>(new Map());
	const layoutKeysRef = useRef<Map<React.Key, ItemLoc>>(new Map());
	const keysRef = useRef<Array<React.Key>>([]);

	const layout = parentLayout ?? layoutRef;

	const performFilter = useCallback(
		(child: ChildElement) => {
			if (!filter) {
				return false;
			}

			if (typeof child.props.children === 'string') {
				return !filter(child.props.children);
			}

			if (filterKey && child.props[filterKey]) {
				return !filter(child.props[filterKey]);
			}

			return false;
		},
		[filter]
	);

	const performItemRender = useCallback(
		(
			child: ChildElement,
			key: React.Key,
			index: number,
			item?: T,
			props?: Record<string, any>
		) => {
			if (performFilter(child)) {
				return;
			}

			if (ItemContainer) {
				return (
					<ItemContainer
						index={index}
						item={item}
						key={key}
						keyValue={key}
					>
						{props
							? React.cloneElement(
									child as React.ReactElement,
									props
							  )
							: child}
					</ItemContainer>
				);
			}

			const hasChildNeedPassthroughKey = child.type.passthroughKey;

			return React.cloneElement(child as React.ReactElement<any>, {
				key,
				...(passthroughKey || hasChildNeedPassthroughKey
					? {index, keyValue: key}
					: {}),
				...(props ? props : {}),
			});
		},
		[ItemContainer, performFilter]
	);

	const createItemsLayout = useCallback(
		({children, items}: ICollectionProps<T, P>) => {
			keysRef.current = [];
			layoutKeysRef.current.clear();

			// Pre-initialization of nested collections to mount the layout
			// structure.
			// TODO: Mount a structure with the children's information and cache it
			// to use when rendering the component.
			const callNestedChild = (child: ChildElement) => {
				if (
					child.type.displayName &&
					SECTION_NAMES.includes(child.type.displayName)
				) {
					const {children, items} = child.props;

					createItemsLayout({children, items});
				}
			};

			function registerItem(
				childKey: React.Key,
				child: ChildElement,
				index: number
			) {
				if (performFilter(child)) {
					return;
				}

				const key = getKey(index, childKey, parentKey);

				if (child.type.displayName === 'Item') {
					layout.current.set(key, {
						index,
						value: getTextValue(
							key,
							child,
							suppressTextValueWarning
						),
					});
				}

				const prevKey = keysRef.current[keysRef.current.length - 1];
				keysRef.current.push(key);

				layoutKeysRef.current.set(key, {prevKey});

				if (layoutKeysRef.current.has(prevKey)) {
					layoutKeysRef.current.set(prevKey, {
						...layoutKeysRef.current.get(prevKey),
						nextKey: key,
					});
				}
			}

			if (items && children instanceof Function) {
				for (let index = 0; index < items.length; index++) {
					const item = items[index];
					const publicItem = exclude
						? excludeProps(item as T, exclude)
						: (item as T);
					const child = Array.isArray(publicApi)
						? (children(publicItem, ...publicApi) as ChildElement)
						: (children(publicItem) as ChildElement);

					callNestedChild(child);

					registerItem((item as T).id ?? child.key, child, index);
				}
			} else {
				React.Children.forEach(children, (child, index) => {
					if (!React.isValidElement(child)) {
						return;
					}

					callNestedChild(child as ChildElement);

					registerItem(child.key!, child as ChildElement, index);
				});
			}
		},
		[performFilter, publicApi, virtualizer?.getVirtualItems().length]
	);

	const performCollectionRender = useCallback(
		({children, items}: ICollectionProps<T, P>) => {
			if (children instanceof Function && items) {
				if (virtualizer) {
					return virtualizer.getVirtualItems().map((virtual) => {
						const item = items[virtual.index];

						const publicItem = exclude
							? excludeProps(item, exclude)
							: item;
						const child = Array.isArray(publicApi)
							? (children(
									publicItem,
									...publicApi
							  ) as ChildElement)
							: (children(publicItem) as ChildElement);

						const props = {
							'data-index': virtual.index,
							ref: (node: HTMLElement) => {
								virtualizer.measureElement(node);

								const ref = (child as ChildElement).ref;

								if (typeof ref === 'function') {
									ref(node);
								}
							},
							style: {
								left: 0,
								position: 'absolute',
								top: 0,
								transform: `translateY(${virtual.start}px)`,
								width: '100%',
							},
						};

						return performItemRender(
							child,
							getKey(
								virtual.index,
								item.id ?? child.key,
								parentKey
							),
							virtual.index,
							item,
							props
						);
					});
				}

				return items.map((item, index) => {
					const publicItem = exclude
						? excludeProps(item, exclude)
						: item;
					const child = Array.isArray(publicApi)
						? (children(publicItem, ...publicApi) as ChildElement)
						: (children(publicItem) as ChildElement);

					return performItemRender(
						child,
						getKey(index, item.id ?? child.key, parentKey),
						index,
						item
					);
				});
			}

			return React.Children.map(children, (child, index) => {
				if (!React.isValidElement(child)) {
					return null;
				}

				return performItemRender(
					child as ChildElement,
					getKey(index, child.key, parentKey),
					index
				);
			});
		},
		[performItemRender, publicApi, virtualizer?.getVirtualItems().length]
	);

	const getItem = useCallback((key: React.Key) => {
		return layout.current.get(key)!;
	}, []);

	const getFirstItem = useCallback(() => {
		const key = layout.current.keys().next().value;

		return {
			key,
			...layout.current.get(key)!,
		};
	}, []);

	const getLastItem = useCallback(() => {
		const key = Array.from(layout.current.keys()).pop()!;

		return {
			key,
			...layout.current.get(key)!,
		};
	}, []);

	const getItems = useCallback(() => {
		return Array.from(layout.current.keys());
	}, []);

	// It builds the dynamic or static collection, done in two steps: Data and
	// Rendering, both go through the elements to get the data of each item.
	//
	// - Data: We get the data of the item to consume later
	// - Rendering: We render each element in memory
	//
	// For a small list we have no problem going walk the items twice to extract
	// the data and then rendering for a large list only the data step will go
	// through all the elements the render step will go through only the items
	// that should be rendered with virtualization from list.
	const collection = useMemo(() => {
		if (!parentLayout) {
			layout.current.clear();
		}

		// Walks through the elements to compute the layout of the collection
		// before rendering the element. The data can be consumed later even
		// if the element is not rendered.
		createItemsLayout({children, items});

		const list = performCollectionRender({children, items});

		if (list.length === 0 && notFound) {
			return notFound;
		}

		return list;
	}, [children, createItemsLayout, performCollectionRender, items]);

	return {
		UNSAFE_virtualizer: virtualizer,
		collection: (
			<CollectionContext.Provider value={{keys: layoutKeysRef, layout}}>
				{collection}
			</CollectionContext.Provider>
		),
		getFirstItem,
		getItem,
		getItems,
		getLastItem,
		size: virtualizer ? virtualizer.getTotalSize() : undefined,
		virtualize: !!virtualizer,
	};
}

export function useCollectionKeys() {
	const {keys} = useContext(CollectionContext);

	return keys;
}

function getTextValue(
	key: React.Key,
	child: ChildElement,
	suppressTextValueWarning: boolean
) {
	if (typeof child.props.children === 'string') {
		return child.props.children;
	}

	if (child.props.textValue) {
		return child.props.textValue;
	}

	if (!suppressTextValueWarning) {
		console.warn(
			`Clay: <Item key="${key}" /> with non-plain text content is not compatible with the type being selected. Please add a \`textValue\` prop.`
		);
	}

	return '';
}
