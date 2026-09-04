/* @ds-bundle: {"namespace":"LalamoveUI","components":[{"name":"Badge","sourcePath":"components/general/Badge/Badge.jsx"},{"name":"Button","sourcePath":"components/general/Button/Button.jsx"},{"name":"Calendar","sourcePath":"components/general/Calendar/Calendar.jsx"},{"name":"Card","sourcePath":"components/general/Card/Card.jsx"},{"name":"Checkbox","sourcePath":"components/general/Checkbox/Checkbox.jsx"},{"name":"Dialog","sourcePath":"components/general/Dialog/Dialog.jsx"},{"name":"DropdownMenu","sourcePath":"components/general/DropdownMenu/DropdownMenu.jsx"},{"name":"Input","sourcePath":"components/general/Input/Input.jsx"},{"name":"Label","sourcePath":"components/general/Label/Label.jsx"},{"name":"Popover","sourcePath":"components/general/Popover/Popover.jsx"},{"name":"Select","sourcePath":"components/general/Select/Select.jsx"},{"name":"Table","sourcePath":"components/general/Table/Table.jsx"},{"name":"Tabs","sourcePath":"components/general/Tabs/Tabs.jsx"},{"name":"Textarea","sourcePath":"components/general/Textarea/Textarea.jsx"}],"sourceHashes":{"components/general/Badge/Badge.jsx":"78c237fe3fb0","components/general/Badge/Badge.d.ts":"b57dafb7530b","components/general/Badge/Badge.prompt.md":"4a475f7d89d5","components/general/Button/Button.jsx":"1315d43b13c8","components/general/Button/Button.d.ts":"97533039038c","components/general/Button/Button.prompt.md":"50fe477950bc","components/general/Calendar/Calendar.jsx":"43672f0862a5","components/general/Calendar/Calendar.d.ts":"6263df667b1a","components/general/Calendar/Calendar.prompt.md":"c489e5a5fb1e","components/general/Card/Card.jsx":"43079919036f","components/general/Card/Card.d.ts":"a855e6381365","components/general/Card/Card.prompt.md":"2c2dd43a60d7","components/general/Checkbox/Checkbox.jsx":"6f40d079f480","components/general/Checkbox/Checkbox.d.ts":"d176089c2584","components/general/Checkbox/Checkbox.prompt.md":"3d044f49192a","components/general/Dialog/Dialog.jsx":"2b92d6780f6e","components/general/Dialog/Dialog.d.ts":"641c04b79309","components/general/Dialog/Dialog.prompt.md":"5d9a9ff4e718","components/general/DropdownMenu/DropdownMenu.jsx":"ff934e16df9d","components/general/DropdownMenu/DropdownMenu.d.ts":"532d667f34aa","components/general/DropdownMenu/DropdownMenu.prompt.md":"f4abe063be39","components/general/Input/Input.jsx":"64defae36812","components/general/Input/Input.d.ts":"479a7ebcdcdb","components/general/Input/Input.prompt.md":"0e9438ee0ad5","components/general/Label/Label.jsx":"2a1a57370af9","components/general/Label/Label.d.ts":"ff4aff75235a","components/general/Label/Label.prompt.md":"2cef85bd6fc1","components/general/Popover/Popover.jsx":"2769f50d0bbc","components/general/Popover/Popover.d.ts":"2af0cb7e7ff5","components/general/Popover/Popover.prompt.md":"e68ae6423ceb","components/general/Select/Select.jsx":"1f8e5ff89b3d","components/general/Select/Select.d.ts":"13ba5afbb516","components/general/Select/Select.prompt.md":"a3463f589fc9","components/general/Table/Table.jsx":"ec584d9432d9","components/general/Table/Table.d.ts":"6cacfdd1e4ce","components/general/Table/Table.prompt.md":"0352e27379eb","components/general/Tabs/Tabs.jsx":"9979c7fc0453","components/general/Tabs/Tabs.d.ts":"2f8606e400d3","components/general/Tabs/Tabs.prompt.md":"f1ed03f2f2cc","components/general/Textarea/Textarea.jsx":"ade094914fd9","components/general/Textarea/Textarea.d.ts":"080192a7455b","components/general/Textarea/Textarea.prompt.md":"3f4c356c29d0"},"inlinedExternals":[".pnpm"],"builtBy":"cc-design-sync"} */
"use strict";
var LalamoveUI = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx20(t, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c);
      }
      function jsxs3(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx20;
      module.exports.jsxs = jsxs3;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs3 : jsx20)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // shim:react-dom-shim
  var require_react_dom_shim = __commonJS({
    "shim:react-dom-shim"(exports, module) {
      init_define_import_meta_env();
      var D = window.ReactDOM;
      var n = function() {
      };
      module.exports = Object.assign({ preload: n, preinit: n, preconnect: n, prefetchDNS: n, preloadModule: n, preinitModule: n }, D);
    }
  });

  // ds-bundle/.bundle-entry.mjs
  var bundle_entry_exports = {};
  __export(bundle_entry_exports, {
    Badge: () => Badge,
    Button: () => Button,
    Calendar: () => Calendar,
    CalendarDayButton: () => CalendarDayButton,
    Card: () => Card,
    CardAction: () => CardAction,
    CardContent: () => CardContent,
    CardDescription: () => CardDescription,
    CardFooter: () => CardFooter,
    CardHeader: () => CardHeader,
    CardTitle: () => CardTitle,
    Checkbox: () => Checkbox3,
    Dialog: () => Dialog2,
    DialogClose: () => DialogClose3,
    DialogContent: () => DialogContent3,
    DialogDescription: () => DialogDescription3,
    DialogFooter: () => DialogFooter,
    DialogHeader: () => DialogHeader,
    DialogOverlay: () => DialogOverlay3,
    DialogPortal: () => DialogPortal2,
    DialogTitle: () => DialogTitle3,
    DialogTrigger: () => DialogTrigger3,
    DropdownMenu: () => DropdownMenu2,
    DropdownMenuCheckboxItem: () => DropdownMenuCheckboxItem3,
    DropdownMenuContent: () => DropdownMenuContent3,
    DropdownMenuGroup: () => DropdownMenuGroup3,
    DropdownMenuItem: () => DropdownMenuItem3,
    DropdownMenuLabel: () => DropdownMenuLabel3,
    DropdownMenuPortal: () => DropdownMenuPortal2,
    DropdownMenuRadioGroup: () => DropdownMenuRadioGroup3,
    DropdownMenuRadioItem: () => DropdownMenuRadioItem3,
    DropdownMenuSeparator: () => DropdownMenuSeparator3,
    DropdownMenuShortcut: () => DropdownMenuShortcut,
    DropdownMenuSub: () => DropdownMenuSub2,
    DropdownMenuSubContent: () => DropdownMenuSubContent3,
    DropdownMenuSubTrigger: () => DropdownMenuSubTrigger3,
    DropdownMenuTrigger: () => DropdownMenuTrigger3,
    DsAdminSurface: () => DsAdminSurface,
    Input: () => Input,
    Label: () => Label4,
    Popover: () => Popover2,
    PopoverAnchor: () => PopoverAnchor3,
    PopoverContent: () => PopoverContent3,
    PopoverDescription: () => PopoverDescription,
    PopoverHeader: () => PopoverHeader,
    PopoverTitle: () => PopoverTitle,
    PopoverTrigger: () => PopoverTrigger3,
    Select: () => Select3,
    SelectContent: () => SelectContent3,
    SelectGroup: () => SelectGroup3,
    SelectItem: () => SelectItem3,
    SelectLabel: () => SelectLabel3,
    SelectScrollDownButton: () => SelectScrollDownButton3,
    SelectScrollUpButton: () => SelectScrollUpButton3,
    SelectSeparator: () => SelectSeparator3,
    SelectTrigger: () => SelectTrigger3,
    SelectValue: () => SelectValue3,
    Table: () => Table,
    TableBody: () => TableBody,
    TableCaption: () => TableCaption,
    TableCell: () => TableCell,
    TableFooter: () => TableFooter,
    TableHead: () => TableHead,
    TableHeader: () => TableHeader,
    TableRow: () => TableRow,
    Tabs: () => Tabs3,
    TabsContent: () => TabsContent3,
    TabsList: () => TabsList3,
    TabsTrigger: () => TabsTrigger3,
    Textarea: () => Textarea,
    __dsMainNs: () => ds_entry_exports,
    badgeVariants: () => badgeVariants,
    buttonVariants: () => buttonVariants,
    tabsListVariants: () => tabsListVariants
  });
  init_define_import_meta_env();

  // .design-sync/provider.tsx
  init_define_import_meta_env();
  var React = __toESM(require_react_shim(), 1);
  function DsAdminSurface({ children }) {
    return /* @__PURE__ */ React.createElement("div", { "data-admin-surface": true, style: { minHeight: "100%" } }, children);
  }

  // .ds-entry.mjs
  var ds_entry_exports = {};
  __export(ds_entry_exports, {
    Badge: () => Badge,
    Button: () => Button,
    Calendar: () => Calendar,
    CalendarDayButton: () => CalendarDayButton,
    Card: () => Card,
    CardAction: () => CardAction,
    CardContent: () => CardContent,
    CardDescription: () => CardDescription,
    CardFooter: () => CardFooter,
    CardHeader: () => CardHeader,
    CardTitle: () => CardTitle,
    Checkbox: () => Checkbox3,
    Dialog: () => Dialog2,
    DialogClose: () => DialogClose3,
    DialogContent: () => DialogContent3,
    DialogDescription: () => DialogDescription3,
    DialogFooter: () => DialogFooter,
    DialogHeader: () => DialogHeader,
    DialogOverlay: () => DialogOverlay3,
    DialogPortal: () => DialogPortal2,
    DialogTitle: () => DialogTitle3,
    DialogTrigger: () => DialogTrigger3,
    DropdownMenu: () => DropdownMenu2,
    DropdownMenuCheckboxItem: () => DropdownMenuCheckboxItem3,
    DropdownMenuContent: () => DropdownMenuContent3,
    DropdownMenuGroup: () => DropdownMenuGroup3,
    DropdownMenuItem: () => DropdownMenuItem3,
    DropdownMenuLabel: () => DropdownMenuLabel3,
    DropdownMenuPortal: () => DropdownMenuPortal2,
    DropdownMenuRadioGroup: () => DropdownMenuRadioGroup3,
    DropdownMenuRadioItem: () => DropdownMenuRadioItem3,
    DropdownMenuSeparator: () => DropdownMenuSeparator3,
    DropdownMenuShortcut: () => DropdownMenuShortcut,
    DropdownMenuSub: () => DropdownMenuSub2,
    DropdownMenuSubContent: () => DropdownMenuSubContent3,
    DropdownMenuSubTrigger: () => DropdownMenuSubTrigger3,
    DropdownMenuTrigger: () => DropdownMenuTrigger3,
    Input: () => Input,
    Label: () => Label4,
    Popover: () => Popover2,
    PopoverAnchor: () => PopoverAnchor3,
    PopoverContent: () => PopoverContent3,
    PopoverDescription: () => PopoverDescription,
    PopoverHeader: () => PopoverHeader,
    PopoverTitle: () => PopoverTitle,
    PopoverTrigger: () => PopoverTrigger3,
    Select: () => Select3,
    SelectContent: () => SelectContent3,
    SelectGroup: () => SelectGroup3,
    SelectItem: () => SelectItem3,
    SelectLabel: () => SelectLabel3,
    SelectScrollDownButton: () => SelectScrollDownButton3,
    SelectScrollUpButton: () => SelectScrollUpButton3,
    SelectSeparator: () => SelectSeparator3,
    SelectTrigger: () => SelectTrigger3,
    SelectValue: () => SelectValue3,
    Table: () => Table,
    TableBody: () => TableBody,
    TableCaption: () => TableCaption,
    TableCell: () => TableCell,
    TableFooter: () => TableFooter,
    TableHead: () => TableHead,
    TableHeader: () => TableHeader,
    TableRow: () => TableRow,
    Tabs: () => Tabs3,
    TabsContent: () => TabsContent3,
    TabsList: () => TabsList3,
    TabsTrigger: () => TabsTrigger3,
    Textarea: () => Textarea,
    badgeVariants: () => badgeVariants,
    buttonVariants: () => buttonVariants,
    tabsListVariants: () => tabsListVariants
  });
  init_define_import_meta_env();

  // src/components/ui/badge.tsx
  init_define_import_meta_env();
  var React44 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
  init_define_import_meta_env();
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }

  // node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
  var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
  var cx = clsx;
  var cva = (base, config) => (props) => {
    var _config_compoundVariants;
    if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
    const { variants, defaultVariants } = config;
    const getVariantClassNames = Object.keys(variants).map((variant) => {
      const variantProp = props === null || props === void 0 ? void 0 : props[variant];
      const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
      if (variantProp === null) return null;
      const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
      return variants[variant][variantKey];
    });
    const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
      let [key, value] = param;
      if (value === void 0) {
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
    const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
      let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
      return Object.entries(compoundVariantOptions).every((param2) => {
        let [key, value] = param2;
        return Array.isArray(value) ? value.includes({
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key]) : {
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key] === value;
      }) ? [
        ...acc,
        cvClass,
        cvClassName
      ] : acc;
    }, []);
    return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
  };

  // node_modules/.pnpm/radix-ui@1.6.7_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react@19.2.17_react_ac18d1d3357e5eaee77c9b9ad67237e0/node_modules/radix-ui/dist/index.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/@radix-ui+react-visually-hidden@1.2.11_@types+react-dom@19.2.3_@types+react@19.2.17__@t_49902735f28f2f777072691117febbac/node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
  init_define_import_meta_env();
  var React5 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-primitive@2.1.10_@types+react-dom@19.2.3_@types+react@19.2.17__@types+r_be17283a23f513d7b972453cc36e2a96/node_modules/@radix-ui/react-primitive/dist/index.mjs
  init_define_import_meta_env();
  var React4 = __toESM(require_react_shim(), 1);
  var ReactDOM = __toESM(require_react_dom_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-slot@1.3.3_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-slot/dist/index.mjs
  var dist_exports = {};
  __export(dist_exports, {
    Root: () => Slot,
    Slot: () => Slot,
    Slottable: () => Slottable,
    createSlot: () => createSlot,
    createSlottable: () => createSlottable
  });
  init_define_import_meta_env();
  var React3 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.5_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
  init_define_import_meta_env();
  var React2 = __toESM(require_react_shim(), 1);
  var __defProp2 = Object.defineProperty;
  var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
  function setRef(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  __name(setRef, "setRef");
  function composeRefs(...refs) {
    return (node) => {
      let hasCleanup = false;
      const cleanups = refs.map((ref) => {
        const cleanup = setRef(ref, node);
        if (!hasCleanup && typeof cleanup == "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup == "function") {
              cleanup();
            } else {
              setRef(refs[i], null);
            }
          }
        };
      }
    };
  }
  __name(composeRefs, "composeRefs");
  function useComposedRefs(...refs) {
    return React2.useCallback(composeRefs(...refs), refs);
  }
  __name(useComposedRefs, "useComposedRefs");

  // node_modules/.pnpm/@radix-ui+react-slot@1.3.3_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-slot/dist/index.mjs
  var __defProp3 = Object.defineProperty;
  var __name2 = (target, value) => __defProp3(target, "name", { value, configurable: true });
  // @__NO_SIDE_EFFECTS__
  function createSlot(ownerName) {
    const Slot22 = React3.forwardRef((props, forwardedRef) => {
      let { children, ...slotProps } = props;
      let slottableElement = null;
      let hasSlottable = false;
      const newChildren = [];
      if (isLazyComponent(children) && typeof use === "function") {
        children = use(children._payload);
      }
      React3.Children.forEach(children, (maybeSlottable) => {
        if (isSlottable(maybeSlottable)) {
          hasSlottable = true;
          const slottable = maybeSlottable;
          let child = "child" in slottable.props ? slottable.props.child : slottable.props.children;
          if (isLazyComponent(child) && typeof use === "function") {
            child = use(child._payload);
          }
          slottableElement = getSlottableElementFromSlottable(slottable, child);
          newChildren.push(slottableElement?.props?.children);
        } else {
          newChildren.push(maybeSlottable);
        }
      });
      if (slottableElement) {
        slottableElement = React3.cloneElement(slottableElement, void 0, newChildren);
      } else if (
        // A `Slottable` was found but it didn't resolve to a single element (e.g.
        // it wrapped multiple elements, text, or a render-prop `child` that
        // wasn't an element). Don't fall back to treating the `Slottable` wrapper
        // itself as the slot target — throw a descriptive error below instead.
        !hasSlottable && React3.Children.count(children) === 1 && React3.isValidElement(children)
      ) {
        slottableElement = children;
      }
      const slottableElementRef = slottableElement ? getElementRef(slottableElement) : void 0;
      const composedRef = useComposedRefs(forwardedRef, slottableElementRef);
      if (!slottableElement) {
        if (children || children === 0) {
          throw new Error(
            hasSlottable ? createSlottableError(ownerName) : createSlotError(ownerName)
          );
        }
        return children;
      }
      const mergedProps = mergeProps(slotProps, slottableElement.props ?? {});
      if (slottableElement.type !== React3.Fragment) {
        mergedProps.ref = forwardedRef ? composedRef : slottableElementRef;
      }
      return React3.cloneElement(slottableElement, mergedProps);
    });
    Slot22.displayName = `${ownerName}.Slot`;
    return Slot22;
  }
  __name2(createSlot, "createSlot");
  var Slot = /* @__PURE__ */ createSlot("Slot");
  var SLOTTABLE_IDENTIFIER = /* @__PURE__ */ Symbol.for("radix.slottable");
  // @__NO_SIDE_EFFECTS__
  function createSlottable(ownerName) {
    const Slottable2 = /* @__PURE__ */ __name2((props) => "child" in props ? props.children(props.child) : props.children, "Slottable");
    Slottable2.displayName = `${ownerName}.Slottable`;
    Slottable2.__radixId = SLOTTABLE_IDENTIFIER;
    return Slottable2;
  }
  __name2(createSlottable, "createSlottable");
  var Slottable = /* @__PURE__ */ createSlottable("Slottable");
  var getSlottableElementFromSlottable = /* @__PURE__ */ __name2((slottable, child) => {
    if ("child" in slottable.props) {
      const child2 = slottable.props.child;
      if (!React3.isValidElement(child2)) return null;
      return React3.cloneElement(child2, void 0, slottable.props.children(child2.props.children));
    }
    return React3.isValidElement(child) ? child : null;
  }, "getSlottableElementFromSlottable");
  function mergeProps(slotProps, childProps) {
    const overrideProps = { ...childProps };
    for (const propName in childProps) {
      const slotPropValue = slotProps[propName];
      const childPropValue = childProps[propName];
      const isHandler = /^on[A-Z]/.test(propName);
      if (isHandler) {
        if (slotPropValue && childPropValue) {
          overrideProps[propName] = (...args) => {
            const result = childPropValue(...args);
            slotPropValue(...args);
            return result;
          };
        } else if (slotPropValue) {
          overrideProps[propName] = slotPropValue;
        }
      } else if (propName === "style") {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue };
      } else if (propName === "className") {
        overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
      }
    }
    return { ...slotProps, ...overrideProps };
  }
  __name2(mergeProps, "mergeProps");
  function getElementRef(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  __name2(getElementRef, "getElementRef");
  function isSlottable(child) {
    return React3.isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
  }
  __name2(isSlottable, "isSlottable");
  var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
  function isLazyComponent(element) {
    return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
  }
  __name2(isLazyComponent, "isLazyComponent");
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
  }
  __name2(isPromiseLike, "isPromiseLike");
  var createSlotError = /* @__PURE__ */ __name2((ownerName) => {
    return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
  }, "createSlotError");
  var createSlottableError = /* @__PURE__ */ __name2((ownerName) => {
    return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
  }, "createSlottableError");
  var use = React3[" use ".trim().toString()];

  // node_modules/.pnpm/@radix-ui+react-primitive@2.1.10_@types+react-dom@19.2.3_@types+react@19.2.17__@types+r_be17283a23f513d7b972453cc36e2a96/node_modules/@radix-ui/react-primitive/dist/index.mjs
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var __defProp4 = Object.defineProperty;
  var __name3 = (target, value) => __defProp4(target, "name", { value, configurable: true });
  var NODES = [
    "a",
    "button",
    "div",
    "form",
    "h2",
    "h3",
    "img",
    "input",
    "label",
    "li",
    "nav",
    "ol",
    "p",
    "select",
    "span",
    "svg",
    "ul"
  ];
  var Primitive = NODES.reduce((primitive, node) => {
    const Slot6 = createSlot(`Primitive.${node}`);
    const Node2 = React4.forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot6 : node;
      if (typeof window !== "undefined") {
        window[/* @__PURE__ */ Symbol.for("radix-ui")] = true;
      }
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Comp, { ...primitiveProps, ref: forwardedRef });
    });
    Node2.displayName = `Primitive.${node}`;
    return { ...primitive, [node]: Node2 };
  }, {});
  function dispatchDiscreteCustomEvent(target, event) {
    if (target) ReactDOM.flushSync(() => target.dispatchEvent(event));
  }
  __name3(dispatchDiscreteCustomEvent, "dispatchDiscreteCustomEvent");

  // node_modules/.pnpm/@radix-ui+react-visually-hidden@1.2.11_@types+react-dom@19.2.3_@types+react@19.2.17__@t_49902735f28f2f777072691117febbac/node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
  var import_jsx_runtime2 = __toESM(require_react_shim(), 1);
  var VISUALLY_HIDDEN_STYLES = Object.freeze({
    // See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
    position: "absolute",
    border: 0,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    wordWrap: "normal"
  });

  // node_modules/.pnpm/@radix-ui+react-context@1.2.2_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-context/dist/index.mjs
  init_define_import_meta_env();
  var React6 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime3 = __toESM(require_react_shim(), 1);
  var __defProp5 = Object.defineProperty;
  var __name4 = (target, value) => __defProp5(target, "name", { value, configurable: true });
  // @__NO_SIDE_EFFECTS__
  function createContext2(rootComponentName, defaultContext) {
    const Context = React6.createContext(defaultContext);
    Context.displayName = rootComponentName + "Context";
    const Provider = /* @__PURE__ */ __name4((props) => {
      const { children, ...context } = props;
      const value = React6.useMemo(() => context, Object.values(context));
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Context.Provider, { value, children });
    }, "Provider");
    Provider.displayName = rootComponentName + "Provider";
    function useContext22(consumerName, options2 = {}) {
      const { optional = false } = options2;
      const context = React6.useContext(Context);
      if (context) return context;
      if (defaultContext !== void 0) return defaultContext;
      if (optional) return void 0;
      throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
    }
    __name4(useContext22, "useContext");
    return [Provider, useContext22];
  }
  __name4(createContext2, "createContext");
  // @__NO_SIDE_EFFECTS__
  function createContextScope(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext32(rootComponentName, defaultContext) {
      const BaseContext = React6.createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index2 = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider = /* @__PURE__ */ __name4((props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const value = React6.useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Context.Provider, { value, children });
      }, "Provider");
      Provider.displayName = rootComponentName + "Provider";
      function useContext22(consumerName, scope, options2 = {}) {
        const { optional = false } = options2;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const context = React6.useContext(Context);
        if (context) return context;
        if (defaultContext !== void 0) return defaultContext;
        if (optional) return void 0;
        throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
      }
      __name4(useContext22, "useContext");
      return [Provider, useContext22];
    }
    __name4(createContext32, "createContext");
    const createScope = /* @__PURE__ */ __name4(() => {
      const scopeContexts = defaultContexts.map((defaultContext) => {
        return React6.createContext(defaultContext);
      });
      return /* @__PURE__ */ __name4(function useScope(scope) {
        const contexts = scope?.[scopeName] || scopeContexts;
        return React6.useMemo(
          () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
          [scope, contexts]
        );
      }, "useScope");
    }, "createScope");
    createScope.scopeName = scopeName;
    return [createContext32, composeContextScopes(createScope, ...createContextScopeDeps)];
  }
  __name4(createContextScope, "createContextScope");
  function composeContextScopes(...scopes) {
    const baseScope = scopes[0];
    if (scopes.length === 1) return baseScope;
    const createScope = /* @__PURE__ */ __name4(() => {
      const scopeHooks = scopes.map((createScope2) => ({
        useScope: createScope2(),
        scopeName: createScope2.scopeName
      }));
      return /* @__PURE__ */ __name4(function useComposedScopes(overrideScopes) {
        const nextScopes = scopeHooks.reduce((nextScopes2, { useScope, scopeName }) => {
          const scopeProps = useScope(overrideScopes);
          const currentScope = scopeProps[`__scope${scopeName}`];
          return { ...nextScopes2, ...currentScope };
        }, {});
        return React6.useMemo(() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }), [nextScopes]);
      }, "useComposedScopes");
    }, "createScope");
    createScope.scopeName = baseScope.scopeName;
    return createScope;
  }
  __name4(composeContextScopes, "composeContextScopes");

  // node_modules/.pnpm/@radix-ui+react-collection@1.1.15_@types+react-dom@19.2.3_@types+react@19.2.17__@types+_e3b314e214d3788bd2a3a0fbdfeba189/node_modules/@radix-ui/react-collection/dist/index.mjs
  init_define_import_meta_env();
  var React7 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime4 = __toESM(require_react_shim(), 1);
  var React22 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime5 = __toESM(require_react_shim(), 1);
  var __defProp6 = Object.defineProperty;
  var __name5 = (target, value) => __defProp6(target, "name", { value, configurable: true });
  // @__NO_SIDE_EFFECTS__
  function createCollection(name) {
    const PROVIDER_NAME = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope4] = createContextScope(PROVIDER_NAME);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME,
      { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
    );
    const CollectionProvider = /* @__PURE__ */ __name5((props) => {
      const { scope, children } = props;
      const ref = React7.useRef(null);
      const itemMap = React7.useRef(/* @__PURE__ */ new Map()).current;
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CollectionProviderImpl, { scope, itemMap, collectionRef: ref, children });
    }, "CollectionProvider");
    CollectionProvider.displayName = PROVIDER_NAME;
    const COLLECTION_SLOT_NAME = name + "CollectionSlot";
    const CollectionSlotImpl = createSlot(COLLECTION_SLOT_NAME);
    const CollectionSlot = React7.forwardRef(
      (props, forwardedRef) => {
        const { scope, children } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = useComposedRefs(forwardedRef, context.collectionRef);
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CollectionSlotImpl, { ref: composedRefs, children });
      }
    );
    CollectionSlot.displayName = COLLECTION_SLOT_NAME;
    const ITEM_SLOT_NAME = name + "CollectionItemSlot";
    const ITEM_DATA_ATTR = "data-radix-collection-item";
    const CollectionItemSlotImpl = createSlot(ITEM_SLOT_NAME);
    const CollectionItemSlot = React7.forwardRef(
      (props, forwardedRef) => {
        const { scope, children, ...itemData } = props;
        const ref = React7.useRef(null);
        const composedRefs = useComposedRefs(forwardedRef, ref);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        React7.useEffect(() => {
          context.itemMap.set(ref, { ref, ...itemData });
          return () => void context.itemMap.delete(ref);
        });
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
      }
    );
    CollectionItemSlot.displayName = ITEM_SLOT_NAME;
    function useCollection4(scope) {
      const context = useCollectionContext(name + "CollectionConsumer", scope);
      const getItems = React7.useCallback(() => {
        const collectionNode = context.collectionRef.current;
        if (!collectionNode) return [];
        const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
        const items = Array.from(context.itemMap.values());
        const orderedItems = items.sort(
          (a, b) => orderedNodes.indexOf(a.ref.current) - orderedNodes.indexOf(b.ref.current)
        );
        return orderedItems;
      }, [context.collectionRef, context.itemMap]);
      return getItems;
    }
    __name5(useCollection4, "useCollection");
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      useCollection4,
      createCollectionScope4
    ];
  }
  __name5(createCollection, "createCollection");
  var __instanciated = /* @__PURE__ */ new WeakMap();
  var _keys, _a;
  var OrderedDict = (_a = class extends Map {
    constructor(entries) {
      super(entries);
      __privateAdd(this, _keys);
      __privateSet(this, _keys, [...super.keys()]);
      __instanciated.set(this, true);
    }
    set(key, value) {
      if (__instanciated.get(this)) {
        if (this.has(key)) {
          __privateGet(this, _keys)[__privateGet(this, _keys).indexOf(key)] = key;
        } else {
          __privateGet(this, _keys).push(key);
        }
      }
      super.set(key, value);
      return this;
    }
    insert(index2, key, value) {
      const has = this.has(key);
      const length = __privateGet(this, _keys).length;
      const relativeIndex = toSafeInteger(index2);
      let actualIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
      const safeIndex = actualIndex < 0 || actualIndex >= length ? -1 : actualIndex;
      if (safeIndex === this.size || has && safeIndex === this.size - 1 || safeIndex === -1) {
        this.set(key, value);
        return this;
      }
      const size4 = this.size + (has ? 0 : 1);
      if (relativeIndex < 0) {
        actualIndex++;
      }
      const keys = [...__privateGet(this, _keys)];
      let nextValue;
      let shouldSkip = false;
      for (let i = actualIndex; i < size4; i++) {
        if (actualIndex === i) {
          let nextKey = keys[i];
          if (keys[i] === key) {
            nextKey = keys[i + 1];
          }
          if (has) {
            this.delete(key);
          }
          nextValue = this.get(nextKey);
          this.set(key, value);
        } else {
          if (!shouldSkip && keys[i - 1] === key) {
            shouldSkip = true;
          }
          const currentKey = keys[shouldSkip ? i : i - 1];
          const currentValue = nextValue;
          nextValue = this.get(currentKey);
          this.delete(currentKey);
          this.set(currentKey, currentValue);
        }
      }
      return this;
    }
    with(index2, key, value) {
      const copy = new _a(this);
      copy.insert(index2, key, value);
      return copy;
    }
    before(key) {
      const index2 = __privateGet(this, _keys).indexOf(key) - 1;
      if (index2 < 0) {
        return void 0;
      }
      return this.entryAt(index2);
    }
    /**
     * Sets a new key-value pair at the position before the given key.
     */
    setBefore(key, newKey, value) {
      const index2 = __privateGet(this, _keys).indexOf(key);
      if (index2 === -1) {
        return this;
      }
      return this.insert(index2, newKey, value);
    }
    after(key) {
      let index2 = __privateGet(this, _keys).indexOf(key);
      index2 = index2 === -1 || index2 === this.size - 1 ? -1 : index2 + 1;
      if (index2 === -1) {
        return void 0;
      }
      return this.entryAt(index2);
    }
    /**
     * Sets a new key-value pair at the position after the given key.
     */
    setAfter(key, newKey, value) {
      const index2 = __privateGet(this, _keys).indexOf(key);
      if (index2 === -1) {
        return this;
      }
      return this.insert(index2 + 1, newKey, value);
    }
    first() {
      return this.entryAt(0);
    }
    last() {
      return this.entryAt(-1);
    }
    clear() {
      __privateSet(this, _keys, []);
      return super.clear();
    }
    delete(key) {
      const deleted = super.delete(key);
      if (deleted) {
        __privateGet(this, _keys).splice(__privateGet(this, _keys).indexOf(key), 1);
      }
      return deleted;
    }
    deleteAt(index2) {
      const key = this.keyAt(index2);
      if (key !== void 0) {
        return this.delete(key);
      }
      return false;
    }
    at(index2) {
      const key = at(__privateGet(this, _keys), index2);
      if (key !== void 0) {
        return this.get(key);
      }
    }
    entryAt(index2) {
      const key = at(__privateGet(this, _keys), index2);
      if (key !== void 0) {
        return [key, this.get(key)];
      }
    }
    indexOf(key) {
      return __privateGet(this, _keys).indexOf(key);
    }
    keyAt(index2) {
      return at(__privateGet(this, _keys), index2);
    }
    from(key, offset4) {
      const index2 = this.indexOf(key);
      if (index2 === -1) {
        return void 0;
      }
      let dest = index2 + offset4;
      if (dest < 0) dest = 0;
      if (dest >= this.size) dest = this.size - 1;
      return this.at(dest);
    }
    keyFrom(key, offset4) {
      const index2 = this.indexOf(key);
      if (index2 === -1) {
        return void 0;
      }
      let dest = index2 + offset4;
      if (dest < 0) dest = 0;
      if (dest >= this.size) dest = this.size - 1;
      return this.keyAt(dest);
    }
    find(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return entry;
        }
        index2++;
      }
      return void 0;
    }
    findIndex(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return index2;
        }
        index2++;
      }
      return -1;
    }
    filter(predicate, thisArg) {
      const entries = [];
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          entries.push(entry);
        }
        index2++;
      }
      return new _a(entries);
    }
    map(callbackfn, thisArg) {
      const entries = [];
      let index2 = 0;
      for (const entry of this) {
        entries.push([entry[0], Reflect.apply(callbackfn, thisArg, [entry, index2, this])]);
        index2++;
      }
      return new _a(entries);
    }
    reduce(...args) {
      const [callbackfn, initialValue] = args;
      let index2 = 0;
      let accumulator = initialValue ?? this.at(0);
      for (const entry of this) {
        if (index2 === 0 && args.length === 1) {
          accumulator = entry;
        } else {
          accumulator = Reflect.apply(callbackfn, this, [accumulator, entry, index2, this]);
        }
        index2++;
      }
      return accumulator;
    }
    reduceRight(...args) {
      const [callbackfn, initialValue] = args;
      let accumulator = initialValue ?? this.at(-1);
      for (let index2 = this.size - 1; index2 >= 0; index2--) {
        const entry = this.at(index2);
        if (index2 === this.size - 1 && args.length === 1) {
          accumulator = entry;
        } else {
          accumulator = Reflect.apply(callbackfn, this, [accumulator, entry, index2, this]);
        }
      }
      return accumulator;
    }
    toSorted(compareFn) {
      const entries = [...this.entries()].sort(compareFn);
      return new _a(entries);
    }
    toReversed() {
      const reversed = new _a();
      for (let index2 = this.size - 1; index2 >= 0; index2--) {
        const key = this.keyAt(index2);
        const element = this.get(key);
        reversed.set(key, element);
      }
      return reversed;
    }
    toSpliced(...args) {
      const entries = [...this.entries()];
      entries.splice(...args);
      return new _a(entries);
    }
    slice(start, end) {
      const result = new _a();
      let stop = this.size - 1;
      if (start === void 0) {
        return result;
      }
      if (start < 0) {
        start = start + this.size;
      }
      if (end !== void 0 && end > 0) {
        stop = end - 1;
      }
      for (let index2 = start; index2 <= stop; index2++) {
        const key = this.keyAt(index2);
        const element = this.get(key);
        result.set(key, element);
      }
      return result;
    }
    every(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (!Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return false;
        }
        index2++;
      }
      return true;
    }
    some(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return true;
        }
        index2++;
      }
      return false;
    }
  }, _keys = new WeakMap(), __name5(_a, "OrderedDict"), _a);
  function at(array, index2) {
    if ("at" in Array.prototype) {
      return Array.prototype.at.call(array, index2);
    }
    const actualIndex = toSafeIndex(array, index2);
    return actualIndex === -1 ? void 0 : array[actualIndex];
  }
  __name5(at, "at");
  function toSafeIndex(array, index2) {
    const length = array.length;
    const relativeIndex = toSafeInteger(index2);
    const actualIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
    return actualIndex < 0 || actualIndex >= length ? -1 : actualIndex;
  }
  __name5(toSafeIndex, "toSafeIndex");
  function toSafeInteger(number) {
    return number !== number || number === 0 ? 0 : Math.trunc(number);
  }
  __name5(toSafeInteger, "toSafeInteger");
  // @__NO_SIDE_EFFECTS__
  function createCollection2(name) {
    const PROVIDER_NAME = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope4] = createContextScope(PROVIDER_NAME);
    const [CollectionContextProvider, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME,
      {
        collectionElement: null,
        collectionRef: { current: null },
        collectionRefObject: { current: null },
        itemMap: new OrderedDict(),
        setItemMap: /* @__PURE__ */ __name5(() => void 0, "setItemMap")
      }
    );
    const CollectionProvider = /* @__PURE__ */ __name5(({ state, ...props }) => {
      return state ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CollectionProviderImpl, { ...props, state }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CollectionInit, { ...props });
    }, "CollectionProvider");
    CollectionProvider.displayName = PROVIDER_NAME;
    const CollectionInit = /* @__PURE__ */ __name5((props) => {
      const state = useInitCollection();
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CollectionProviderImpl, { ...props, state });
    }, "CollectionInit");
    CollectionInit.displayName = PROVIDER_NAME + "Init";
    const CollectionProviderImpl = /* @__PURE__ */ __name5((props) => {
      const { scope, children, state } = props;
      const ref = React22.useRef(null);
      const [collectionElement, setCollectionElement] = React22.useState(
        null
      );
      const composeRefs2 = useComposedRefs(ref, setCollectionElement);
      const [itemMap, setItemMap] = state;
      React22.useEffect(() => {
        if (!collectionElement) return;
        const observer = getChildListObserver(() => {
        });
        observer.observe(collectionElement, {
          childList: true,
          subtree: true
        });
        return () => {
          observer.disconnect();
        };
      }, [collectionElement]);
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        CollectionContextProvider,
        {
          scope,
          itemMap,
          setItemMap,
          collectionRef: composeRefs2,
          collectionRefObject: ref,
          collectionElement,
          children
        }
      );
    }, "CollectionProviderImpl");
    CollectionProviderImpl.displayName = PROVIDER_NAME + "Impl";
    const COLLECTION_SLOT_NAME = name + "CollectionSlot";
    const CollectionSlotImpl = createSlot(COLLECTION_SLOT_NAME);
    const CollectionSlot = React22.forwardRef(
      (props, forwardedRef) => {
        const { scope, children } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = useComposedRefs(forwardedRef, context.collectionRef);
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CollectionSlotImpl, { ref: composedRefs, children });
      }
    );
    CollectionSlot.displayName = COLLECTION_SLOT_NAME;
    const ITEM_SLOT_NAME = name + "CollectionItemSlot";
    const ITEM_DATA_ATTR = "data-radix-collection-item";
    const CollectionItemSlotImpl = createSlot(ITEM_SLOT_NAME);
    const CollectionItemSlot = React22.forwardRef(
      (props, forwardedRef) => {
        const { scope, children, ...itemData } = props;
        const ref = React22.useRef(null);
        const [element, setElement] = React22.useState(null);
        const composedRefs = useComposedRefs(forwardedRef, ref, setElement);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        const { setItemMap } = context;
        const itemDataRef = React22.useRef(itemData);
        if (!shallowEqual(itemDataRef.current, itemData)) {
          itemDataRef.current = itemData;
        }
        const memoizedItemData = itemDataRef.current;
        React22.useEffect(() => {
          const itemData2 = memoizedItemData;
          setItemMap((map) => {
            if (!element) {
              return map;
            }
            if (!map.has(element)) {
              map.set(element, { ...itemData2, element });
              return map.toSorted(sortByDocumentPosition);
            }
            return map.set(element, { ...itemData2, element }).toSorted(sortByDocumentPosition);
          });
          return () => {
            setItemMap((map) => {
              if (!element || !map.has(element)) {
                return map;
              }
              map.delete(element);
              return new OrderedDict(map);
            });
          };
        }, [element, memoizedItemData, setItemMap]);
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
      }
    );
    CollectionItemSlot.displayName = ITEM_SLOT_NAME;
    function useInitCollection() {
      return React22.useState(new OrderedDict());
    }
    __name5(useInitCollection, "useInitCollection");
    function useCollection4(scope) {
      const { itemMap } = useCollectionContext(name + "CollectionConsumer", scope);
      return itemMap;
    }
    __name5(useCollection4, "useCollection");
    const functions = {
      createCollectionScope: createCollectionScope4,
      useCollection: useCollection4,
      useInitCollection
    };
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      functions
    ];
  }
  __name5(createCollection2, "createCollection");
  function shallowEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object") return false;
    if (a == null || b == null) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (a[key] !== b[key]) return false;
    }
    return true;
  }
  __name5(shallowEqual, "shallowEqual");
  function isElementPreceding(a, b) {
    return !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING);
  }
  __name5(isElementPreceding, "isElementPreceding");
  function sortByDocumentPosition(a, b) {
    return !a[1].element || !b[1].element ? 0 : isElementPreceding(a[1].element, b[1].element) ? -1 : 1;
  }
  __name5(sortByDocumentPosition, "sortByDocumentPosition");
  function getChildListObserver(callback) {
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === "childList") {
          callback();
          return;
        }
      }
    });
    return observer;
  }
  __name5(getChildListObserver, "getChildListObserver");

  // node_modules/.pnpm/@radix-ui+primitive@1.1.7/node_modules/@radix-ui/primitive/dist/index.mjs
  init_define_import_meta_env();
  var __defProp7 = Object.defineProperty;
  var __name6 = (target, value) => __defProp7(target, "name", { value, configurable: true });
  var canUseDOM = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return /* @__PURE__ */ __name6(function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    }, "handleEvent");
  }
  __name6(composeEventHandlers, "composeEventHandlers");
  function getOwnerWindow(element) {
    if (!canUseDOM) {
      throw new Error("Cannot access window outside of the DOM");
    }
    return element?.ownerDocument?.defaultView ?? window;
  }
  __name6(getOwnerWindow, "getOwnerWindow");
  function getOwnerDocument(element) {
    if (!canUseDOM) {
      throw new Error("Cannot access document outside of the DOM");
    }
    return element?.ownerDocument ?? document;
  }
  __name6(getOwnerDocument, "getOwnerDocument");
  function getActiveElement(node, activeDescendant = false) {
    const { activeElement } = getOwnerDocument(node);
    if (!activeElement?.nodeName) {
      return null;
    }
    if (isFrame(activeElement) && activeElement.contentDocument) {
      return getActiveElement(activeElement.contentDocument.body, activeDescendant);
    }
    if (activeDescendant) {
      const id = activeElement.getAttribute("aria-activedescendant");
      if (id) {
        const element = getOwnerDocument(activeElement).getElementById(id);
        if (element) {
          return element;
        }
      }
    }
    return activeElement;
  }
  __name6(getActiveElement, "getActiveElement");
  function isFrame(element) {
    return element.tagName === "IFRAME";
  }
  __name6(isFrame, "isFrame");

  // node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.6_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  init_define_import_meta_env();
  var React10 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+primitive@1.1.7/node_modules/@radix-ui/primitive/dist/internal/is-development.false.mjs
  init_define_import_meta_env();
  var IS_DEVELOPMENT = false;

  // node_modules/.pnpm/@radix-ui+react-use-layout-effect@1.1.4_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
  init_define_import_meta_env();
  var React8 = __toESM(require_react_shim(), 1);
  var useLayoutEffect2 = globalThis?.document ? React8.useLayoutEffect : () => {
  };

  // node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.6_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  var React23 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-use-effect-event@0.0.5_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-effect-event/dist/index.mjs
  init_define_import_meta_env();
  var React9 = __toESM(require_react_shim(), 1);
  var __defProp8 = Object.defineProperty;
  var __name7 = (target, value) => __defProp8(target, "name", { value, configurable: true });
  var useReactEffectEvent = React9[" useEffectEvent ".trim().toString()];
  var useReactInsertionEffect = React9[" useInsertionEffect ".trim().toString()];
  function useEffectEvent(callback) {
    if (typeof useReactEffectEvent === "function") {
      return useReactEffectEvent(callback);
    }
    const ref = React9.useRef(() => {
      throw new Error("Cannot call an event handler while rendering.");
    });
    if (typeof useReactInsertionEffect === "function") {
      useReactInsertionEffect(() => {
        ref.current = callback;
      });
    } else {
      useLayoutEffect2(() => {
        ref.current = callback;
      });
    }
    return React9.useMemo(() => ((...args) => ref.current?.(...args)), []);
  }
  __name7(useEffectEvent, "useEffectEvent");

  // node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.6_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  var __defProp9 = Object.defineProperty;
  var __name8 = (target, value) => __defProp9(target, "name", { value, configurable: true });
  var useInsertionEffect = React10[" useInsertionEffect ".trim().toString()] || useLayoutEffect2;
  function useControllableState({
    prop,
    defaultProp,
    onChange = /* @__PURE__ */ __name8(() => {
    }, "onChange"),
    caller
  }) {
    const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
      defaultProp,
      onChange
    });
    const isControlled = prop !== void 0;
    const value = isControlled ? prop : uncontrolledProp;
    if (IS_DEVELOPMENT) {
      const isControlledRef = React10.useRef(prop !== void 0);
      React10.useEffect(() => {
        const wasControlled = isControlledRef.current;
        if (wasControlled !== isControlled) {
          const from = wasControlled ? "controlled" : "uncontrolled";
          const to = isControlled ? "controlled" : "uncontrolled";
          console.warn(
            `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
          );
        }
        isControlledRef.current = isControlled;
      }, [isControlled, caller]);
    }
    const setValue = React10.useCallback(
      (nextValue) => {
        if (isControlled) {
          const value2 = isFunction(nextValue) ? nextValue(prop) : nextValue;
          if (value2 !== prop) {
            onChangeRef.current?.(value2);
          }
        } else {
          setUncontrolledProp(nextValue);
        }
      },
      [isControlled, prop, setUncontrolledProp, onChangeRef]
    );
    return [value, setValue];
  }
  __name8(useControllableState, "useControllableState");
  function useUncontrolledState({
    defaultProp,
    onChange
  }) {
    const [value, setValue] = React10.useState(defaultProp);
    const prevValueRef = React10.useRef(value);
    const onChangeRef = React10.useRef(onChange);
    useInsertionEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    React10.useEffect(() => {
      if (prevValueRef.current !== value) {
        onChangeRef.current?.(value);
        prevValueRef.current = value;
      }
    }, [value, prevValueRef]);
    return [value, setValue, onChangeRef];
  }
  __name8(useUncontrolledState, "useUncontrolledState");
  function isFunction(value) {
    return typeof value === "function";
  }
  __name8(isFunction, "isFunction");
  var SYNC_STATE = /* @__PURE__ */ Symbol("RADIX:SYNC_STATE");
  function useControllableStateReducer(reducer, userArgs, initialArg, init) {
    const { prop: controlledState, defaultProp, onChange: onChangeProp, caller } = userArgs;
    const isControlled = controlledState !== void 0;
    const onChange = useEffectEvent(onChangeProp);
    if (IS_DEVELOPMENT) {
      const isControlledRef = React23.useRef(controlledState !== void 0);
      React23.useEffect(() => {
        const wasControlled = isControlledRef.current;
        if (wasControlled !== isControlled) {
          const from = wasControlled ? "controlled" : "uncontrolled";
          const to = isControlled ? "controlled" : "uncontrolled";
          console.warn(
            `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
          );
        }
        isControlledRef.current = isControlled;
      }, [isControlled, caller]);
    }
    const args = [{ ...initialArg, state: defaultProp }];
    if (init) {
      args.push(init);
    }
    const [internalState, dispatch] = React23.useReducer(
      (state2, action) => {
        if (action.type === SYNC_STATE) {
          return { ...state2, state: action.state };
        }
        const next = reducer(state2, action);
        if (isControlled && !Object.is(next.state, state2.state)) {
          onChange(next.state);
        }
        return next;
      },
      ...args
    );
    const uncontrolledState = internalState.state;
    const prevValueRef = React23.useRef(uncontrolledState);
    React23.useEffect(() => {
      if (prevValueRef.current !== uncontrolledState) {
        prevValueRef.current = uncontrolledState;
        if (!isControlled) {
          onChange(uncontrolledState);
        }
      }
    }, [uncontrolledState, prevValueRef, isControlled]);
    const state = React23.useMemo(() => {
      const isControlled2 = controlledState !== void 0;
      if (isControlled2) {
        return { ...internalState, state: controlledState };
      }
      return internalState;
    }, [internalState, controlledState]);
    React23.useEffect(() => {
      if (isControlled && !Object.is(controlledState, internalState.state)) {
        dispatch({ type: SYNC_STATE, state: controlledState });
      }
    }, [controlledState, internalState.state, isControlled]);
    return [state, dispatch];
  }
  __name8(useControllableStateReducer, "useControllableStateReducer");

  // node_modules/.pnpm/@radix-ui+react-presence@1.1.10_@types+react-dom@19.2.3_@types+react@19.2.17__@types+re_138587ba593102bdcf335a5673d92068/node_modules/@radix-ui/react-presence/dist/index.mjs
  init_define_import_meta_env();
  var React24 = __toESM(require_react_shim(), 1);
  var React11 = __toESM(require_react_shim(), 1);
  var __defProp10 = Object.defineProperty;
  var __name9 = (target, value) => __defProp10(target, "name", { value, configurable: true });
  function useStateMachine(initialState, machine) {
    return React11.useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  __name9(useStateMachine, "useStateMachine");
  var Presence = /* @__PURE__ */ __name9((props) => {
    const { present, children } = props;
    const presence = usePresence(present);
    const child = typeof children === "function" ? children({ present: presence.isPresent }) : React24.Children.only(children);
    const ref = useStableComposedRefs(presence.ref, getElementRef2(child));
    const forceMount = typeof children === "function";
    return forceMount || presence.isPresent ? React24.cloneElement(child, { ref }) : null;
  }, "Presence");
  function usePresence(present) {
    const [node, setNode] = React24.useState();
    const stylesRef = React24.useRef(null);
    const prevPresentRef = React24.useRef(present);
    const prevAnimationNameRef = React24.useRef("none");
    const mountAnimationNameRef = React24.useRef(void 0);
    const initialState = present ? "mounted" : "unmounted";
    const [state, send] = useStateMachine(initialState, {
      mounted: {
        UNMOUNT: "unmounted",
        ANIMATION_OUT: "unmountSuspended"
      },
      unmountSuspended: {
        MOUNT: "mounted",
        ANIMATION_END: "unmounted"
      },
      unmounted: {
        MOUNT: "mounted"
      }
    });
    React24.useEffect(() => {
      if (state === "mounted") {
        prevAnimationNameRef.current = mountAnimationNameRef.current ?? getAnimationName(stylesRef.current);
        mountAnimationNameRef.current = void 0;
      } else {
        prevAnimationNameRef.current = "none";
      }
    }, [state]);
    useLayoutEffect2(() => {
      const styles = stylesRef.current;
      const wasPresent = prevPresentRef.current;
      const hasPresentChanged = wasPresent !== present;
      if (hasPresentChanged) {
        const prevAnimationName = prevAnimationNameRef.current;
        const currentAnimationName = getAnimationName(styles);
        if (present) {
          mountAnimationNameRef.current = currentAnimationName;
          send("MOUNT");
        } else if (currentAnimationName === "none" || styles?.display === "none") {
          send("UNMOUNT");
        } else {
          const isAnimating = prevAnimationName !== currentAnimationName;
          if (wasPresent && isAnimating) {
            send("ANIMATION_OUT");
          } else {
            send("UNMOUNT");
          }
        }
        prevPresentRef.current = present;
      }
    }, [present, send]);
    useLayoutEffect2(() => {
      if (node) {
        let timeoutId;
        const ownerWindow = node.ownerDocument.defaultView ?? window;
        const handleAnimationEnd = /* @__PURE__ */ __name9((event) => {
          const currentAnimationName = getAnimationName(stylesRef.current);
          const isCurrentAnimation = currentAnimationName.includes(CSS.escape(event.animationName));
          if (event.target === node && isCurrentAnimation) {
            send("ANIMATION_END");
            if (!prevPresentRef.current) {
              const currentFillMode = node.style.animationFillMode;
              node.style.animationFillMode = "forwards";
              timeoutId = ownerWindow.setTimeout(() => {
                if (node.style.animationFillMode === "forwards") {
                  node.style.animationFillMode = currentFillMode;
                }
              });
            }
          }
        }, "handleAnimationEnd");
        const handleAnimationStart = /* @__PURE__ */ __name9((event) => {
          if (event.target === node) {
            prevAnimationNameRef.current = getAnimationName(stylesRef.current);
          }
        }, "handleAnimationStart");
        node.addEventListener("animationstart", handleAnimationStart);
        node.addEventListener("animationcancel", handleAnimationEnd);
        node.addEventListener("animationend", handleAnimationEnd);
        return () => {
          ownerWindow.clearTimeout(timeoutId);
          node.removeEventListener("animationstart", handleAnimationStart);
          node.removeEventListener("animationcancel", handleAnimationEnd);
          node.removeEventListener("animationend", handleAnimationEnd);
        };
      } else {
        send("ANIMATION_END");
      }
    }, [node, send]);
    return {
      isPresent: ["mounted", "unmountSuspended"].includes(state),
      ref: React24.useCallback((node2) => {
        if (node2) {
          const styles = getComputedStyle(node2);
          stylesRef.current = styles;
          mountAnimationNameRef.current = getAnimationName(styles);
        } else {
          stylesRef.current = null;
        }
        setNode(node2);
      }, [])
    };
  }
  __name9(usePresence, "usePresence");
  function setRef2(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  __name9(setRef2, "setRef");
  function useStableComposedRefs(...refs) {
    const refsRef = React24.useRef(refs);
    refsRef.current = refs;
    return React24.useCallback((node) => {
      const currentRefs = refsRef.current;
      let hasCleanup = false;
      const cleanups = currentRefs.map((ref) => {
        const cleanup = setRef2(ref, node);
        if (!hasCleanup && typeof cleanup === "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup === "function") {
              cleanup();
            } else {
              setRef2(currentRefs[i], null);
            }
          }
        };
      }
    }, []);
  }
  __name9(useStableComposedRefs, "useStableComposedRefs");
  function getAnimationName(styles) {
    return styles?.animationName || "none";
  }
  __name9(getAnimationName, "getAnimationName");
  function getElementRef2(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  __name9(getElementRef2, "getElementRef");

  // node_modules/.pnpm/@radix-ui+react-id@1.1.4_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-id/dist/index.mjs
  init_define_import_meta_env();
  var React12 = __toESM(require_react_shim(), 1);
  var __defProp11 = Object.defineProperty;
  var __name10 = (target, value) => __defProp11(target, "name", { value, configurable: true });
  var useReactId = React12[" useId ".trim().toString()] || (() => void 0);
  var count = 0;
  function useId(deterministicId) {
    const [id, setId] = React12.useState(useReactId());
    useLayoutEffect2(() => {
      if (!deterministicId) setId((reactId) => reactId ?? String(count++));
    }, [deterministicId]);
    return deterministicId || (id ? `radix-${id}` : "");
  }
  __name10(useId, "useId");

  // node_modules/.pnpm/@radix-ui+react-direction@1.1.4_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-direction/dist/index.mjs
  init_define_import_meta_env();
  var React13 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime6 = __toESM(require_react_shim(), 1);
  var __defProp12 = Object.defineProperty;
  var __name11 = (target, value) => __defProp12(target, "name", { value, configurable: true });
  var DirectionContext = React13.createContext(void 0);
  function useDirection(localDir) {
    const globalDir = React13.useContext(DirectionContext);
    return localDir || globalDir || "ltr";
  }
  __name11(useDirection, "useDirection");

  // node_modules/.pnpm/@radix-ui+react-dialog@1.1.23_@types+react-dom@19.2.3_@types+react@19.2.17__@types+reac_ebeaa069aac513f5f318f7d1d5f561bf/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var dist_exports2 = {};
  __export(dist_exports2, {
    Close: () => DialogClose,
    Content: () => DialogContent,
    Description: () => DialogDescription,
    Dialog: () => Dialog,
    DialogClose: () => DialogClose,
    DialogContent: () => DialogContent,
    DialogDescription: () => DialogDescription,
    DialogOverlay: () => DialogOverlay,
    DialogPortal: () => DialogPortal,
    DialogTitle: () => DialogTitle,
    DialogTrigger: () => DialogTrigger,
    Overlay: () => DialogOverlay,
    Portal: () => DialogPortal,
    Root: () => Dialog,
    Title: () => DialogTitle,
    Trigger: () => DialogTrigger,
    WarningProvider: () => WarningProvider,
    createDialogScope: () => createDialogScope
  });
  init_define_import_meta_env();
  var React29 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.19_@types+react-dom@19.2.3_@types+react@19.2.17___1726272c044b69ad8799cdb51c1704df/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  init_define_import_meta_env();
  var React15 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-use-callback-ref@1.1.4_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
  init_define_import_meta_env();
  var React14 = __toESM(require_react_shim(), 1);
  var __defProp13 = Object.defineProperty;
  var __name12 = (target, value) => __defProp13(target, "name", { value, configurable: true });
  function useCallbackRef(callback) {
    const callbackRef = React14.useRef(callback);
    React14.useEffect(() => {
      callbackRef.current = callback;
    });
    return React14.useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
  }
  __name12(useCallbackRef, "useCallbackRef");

  // node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.19_@types+react-dom@19.2.3_@types+react@19.2.17___1726272c044b69ad8799cdb51c1704df/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  var import_jsx_runtime7 = __toESM(require_react_shim(), 1);
  var __defProp14 = Object.defineProperty;
  var __name13 = (target, value) => __defProp14(target, "name", { value, configurable: true });
  var CONTEXT_UPDATE = "dismissableLayer.update";
  var POINTER_DOWN_OUTSIDE = "dismissableLayer.pointerDownOutside";
  var FOCUS_OUTSIDE = "dismissableLayer.focusOutside";
  var originalBodyPointerEvents;
  var DismissableLayerContext = React15.createContext({
    layers: /* @__PURE__ */ new Set(),
    layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
    branches: /* @__PURE__ */ new Set(),
    // Outside elements that belong to a layer's own dismiss affordance (eg, a
    // dialog overlay). Pressing them should dismiss the layer regardless of
    // whether or not they stop propagation.
    //
    // See https://github.com/radix-ui/primitives/issues/3346
    dismissableSurfaces: /* @__PURE__ */ new Set()
  });
  var DismissableLayer = /* @__PURE__ */ React15.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name13(function DismissableLayer2(props, forwardedRef) {
      const {
        disableOutsidePointerEvents = false,
        deferPointerDownOutside = false,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        ...layerProps
      } = props;
      const context = React15.useContext(DismissableLayerContext);
      const [node, setNode] = React15.useState(null);
      const ownerDocument = node?.ownerDocument ?? globalThis?.document;
      const [, force] = React15.useState({});
      const composedRefs = useComposedRefs(forwardedRef, setNode);
      const layers = Array.from(context.layers);
      const [highestLayerWithOutsidePointerEventsDisabled] = [
        ...context.layersWithOutsidePointerEventsDisabled
      ].slice(-1);
      const highestLayerWithOutsidePointerEventsDisabledIndex = highestLayerWithOutsidePointerEventsDisabled ? layers.indexOf(highestLayerWithOutsidePointerEventsDisabled) : -1;
      const index2 = node ? layers.indexOf(node) : -1;
      const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
      const isPointerEventsEnabled = index2 >= highestLayerWithOutsidePointerEventsDisabledIndex;
      const isDeferredPointerDownOutsideRef = React15.useRef(false);
      const pointerDownOutside = usePointerDownOutside(
        (event) => {
          onPointerDownOutside?.(event);
          onInteractOutside?.(event);
          if (!event.defaultPrevented) onDismiss?.();
        },
        {
          ownerDocument,
          deferPointerDownOutside,
          isDeferredPointerDownOutsideRef,
          dismissableSurfaces: context.dismissableSurfaces,
          shouldHandlePointerDownOutside: React15.useCallback(
            (target) => {
              if (!(target instanceof Node)) {
                return false;
              }
              const isPointerDownOnBranch = [...context.branches].some(
                (branch) => branch.contains(target)
              );
              return isPointerEventsEnabled && !isPointerDownOnBranch;
            },
            [context.branches, isPointerEventsEnabled]
          )
        }
      );
      const focusOutside = useFocusOutside((event) => {
        if (deferPointerDownOutside && isDeferredPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isFocusInBranch = [...context.branches].some((branch) => branch.contains(target));
        if (isFocusInBranch) return;
        onFocusOutside?.(event);
        onInteractOutside?.(event);
        if (!event.defaultPrevented) onDismiss?.();
      }, ownerDocument);
      const isHighestLayer = node ? index2 === layers.length - 1 : false;
      const handleKeyDown = useCallbackRef((event) => {
        if (event.key !== "Escape") {
          return;
        }
        onEscapeKeyDown?.(event);
        if (!event.defaultPrevented && onDismiss) {
          event.preventDefault();
          onDismiss();
        }
      });
      React15.useEffect(() => {
        if (!isHighestLayer) {
          return;
        }
        ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => ownerDocument.removeEventListener("keydown", handleKeyDown, { capture: true });
      }, [ownerDocument, isHighestLayer, handleKeyDown]);
      React15.useEffect(() => {
        if (!node) return;
        if (disableOutsidePointerEvents) {
          if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
            originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
            ownerDocument.body.style.pointerEvents = "none";
          }
          context.layersWithOutsidePointerEventsDisabled.add(node);
        }
        context.layers.add(node);
        dispatchUpdate();
        return () => {
          if (disableOutsidePointerEvents) {
            context.layersWithOutsidePointerEventsDisabled.delete(node);
            if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
              ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;
            }
          }
        };
      }, [node, ownerDocument, disableOutsidePointerEvents, context]);
      React15.useEffect(() => {
        return () => {
          if (!node) return;
          context.layers.delete(node);
          context.layersWithOutsidePointerEventsDisabled.delete(node);
          dispatchUpdate();
        };
      }, [node, context]);
      React15.useEffect(() => {
        const handleUpdate = /* @__PURE__ */ __name13(() => force({}), "handleUpdate");
        document.addEventListener(CONTEXT_UPDATE, handleUpdate);
        return () => document.removeEventListener(CONTEXT_UPDATE, handleUpdate);
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        Primitive.div,
        {
          ...layerProps,
          ref: composedRefs,
          style: {
            pointerEvents: isBodyPointerEventsDisabled ? isPointerEventsEnabled ? "auto" : "none" : void 0,
            ...props.style
          },
          onFocusCapture: composeEventHandlers(props.onFocusCapture, focusOutside.onFocusCapture),
          onBlurCapture: composeEventHandlers(props.onBlurCapture, focusOutside.onBlurCapture),
          onPointerDownCapture: composeEventHandlers(
            props.onPointerDownCapture,
            pointerDownOutside.onPointerDownCapture
          )
        }
      );
    }, "DismissableLayer")
  );
  function useDismissableLayerSurface() {
    const context = React15.useContext(DismissableLayerContext);
    const [node, setNode] = React15.useState(null);
    React15.useEffect(() => {
      if (!node) {
        return;
      }
      context.dismissableSurfaces.add(node);
      return () => {
        context.dismissableSurfaces.delete(node);
      };
    }, [node, context.dismissableSurfaces]);
    return setNode;
  }
  __name13(useDismissableLayerSurface, "useDismissableLayerSurface");
  var IS_TRUE = /* @__PURE__ */ __name13(() => true, "IS_TRUE");
  function usePointerDownOutside(onPointerDownOutside, args) {
    const {
      ownerDocument = globalThis?.document,
      deferPointerDownOutside = false,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces,
      shouldHandlePointerDownOutside = IS_TRUE
    } = args;
    const handlePointerDownOutside = useCallbackRef(onPointerDownOutside);
    const isPointerInsideReactTreeRef = React15.useRef(false);
    const isPointerDownOutsideRef = React15.useRef(false);
    const interceptedOutsideInteractionEventsRef = React15.useRef(/* @__PURE__ */ new Map());
    const handleClickRef = React15.useRef(() => {
    });
    React15.useEffect(() => {
      function resetOutsideInteraction() {
        isPointerDownOutsideRef.current = false;
        isDeferredPointerDownOutsideRef.current = false;
        interceptedOutsideInteractionEventsRef.current.clear();
      }
      __name13(resetOutsideInteraction, "resetOutsideInteraction");
      function isOutsideInteractionIntercepted() {
        return Array.from(interceptedOutsideInteractionEventsRef.current.values()).some(Boolean);
      }
      __name13(isOutsideInteractionIntercepted, "isOutsideInteractionIntercepted");
      function handleInteractionCapture(event) {
        if (!isPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isDismissableSurface = target instanceof Node && [...dismissableSurfaces].some((surface) => surface.contains(target));
        if (!isDismissableSurface) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, true);
        }
        if (event.type === "click") {
          window.setTimeout(() => {
            if (isPointerDownOutsideRef.current) {
              handleClickRef.current();
            }
          }, 0);
        }
      }
      __name13(handleInteractionCapture, "handleInteractionCapture");
      function handleInteractionBubble(event) {
        if (isPointerDownOutsideRef.current) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, false);
        }
      }
      __name13(handleInteractionBubble, "handleInteractionBubble");
      const handlePointerDown = /* @__PURE__ */ __name13((event) => {
        if (event.target && !isPointerInsideReactTreeRef.current) {
          let handleAndDispatchPointerDownOutsideEvent2 = function() {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            const wasOutsideInteractionIntercepted = isOutsideInteractionIntercepted();
            resetOutsideInteraction();
            if (!wasOutsideInteractionIntercepted) {
              handleAndDispatchCustomEvent(
                POINTER_DOWN_OUTSIDE,
                handlePointerDownOutside,
                eventDetail,
                { discrete: true }
              );
            }
          };
          var handleAndDispatchPointerDownOutsideEvent = handleAndDispatchPointerDownOutsideEvent2;
          __name13(handleAndDispatchPointerDownOutsideEvent2, "handleAndDispatchPointerDownOutsideEvent");
          if (!shouldHandlePointerDownOutside(event.target)) {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            resetOutsideInteraction();
            isPointerInsideReactTreeRef.current = false;
            return;
          }
          const eventDetail = { originalEvent: event };
          isPointerDownOutsideRef.current = true;
          isDeferredPointerDownOutsideRef.current = deferPointerDownOutside && event.button === 0;
          interceptedOutsideInteractionEventsRef.current.clear();
          if (!deferPointerDownOutside || event.button !== 0) {
            handleAndDispatchPointerDownOutsideEvent2();
          } else {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            handleClickRef.current = handleAndDispatchPointerDownOutsideEvent2;
            ownerDocument.addEventListener("click", handleClickRef.current, { once: true });
          }
        } else {
          ownerDocument.removeEventListener("click", handleClickRef.current);
          resetOutsideInteraction();
        }
        isPointerInsideReactTreeRef.current = false;
      }, "handlePointerDown");
      const outsideInteractionEvents = [
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
        "click"
      ];
      for (const eventName of outsideInteractionEvents) {
        ownerDocument.addEventListener(eventName, handleInteractionCapture, true);
        ownerDocument.addEventListener(eventName, handleInteractionBubble);
      }
      const timerId = window.setTimeout(() => {
        ownerDocument.addEventListener("pointerdown", handlePointerDown);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
        ownerDocument.removeEventListener("pointerdown", handlePointerDown);
        ownerDocument.removeEventListener("click", handleClickRef.current);
        for (const eventName of outsideInteractionEvents) {
          ownerDocument.removeEventListener(eventName, handleInteractionCapture, true);
          ownerDocument.removeEventListener(eventName, handleInteractionBubble);
        }
      };
    }, [
      ownerDocument,
      handlePointerDownOutside,
      deferPointerDownOutside,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces,
      shouldHandlePointerDownOutside
    ]);
    return {
      // ensures we check React component tree (not just DOM tree)
      onPointerDownCapture: /* @__PURE__ */ __name13(() => isPointerInsideReactTreeRef.current = true, "onPointerDownCapture")
    };
  }
  __name13(usePointerDownOutside, "usePointerDownOutside");
  function useFocusOutside(onFocusOutside, ownerDocument = globalThis?.document) {
    const handleFocusOutside = useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = React15.useRef(false);
    React15.useEffect(() => {
      const handleFocus = /* @__PURE__ */ __name13((event) => {
        if (event.target && !isFocusInsideReactTreeRef.current) {
          const eventDetail = { originalEvent: event };
          handleAndDispatchCustomEvent(FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
            discrete: false
          });
        }
      }, "handleFocus");
      ownerDocument.addEventListener("focusin", handleFocus);
      return () => ownerDocument.removeEventListener("focusin", handleFocus);
    }, [ownerDocument, handleFocusOutside]);
    return {
      onFocusCapture: /* @__PURE__ */ __name13(() => isFocusInsideReactTreeRef.current = true, "onFocusCapture"),
      onBlurCapture: /* @__PURE__ */ __name13(() => isFocusInsideReactTreeRef.current = false, "onBlurCapture")
    };
  }
  __name13(useFocusOutside, "useFocusOutside");
  function dispatchUpdate() {
    const event = new CustomEvent(CONTEXT_UPDATE);
    document.dispatchEvent(event);
  }
  __name13(dispatchUpdate, "dispatchUpdate");
  function handleAndDispatchCustomEvent(name, handler, detail, { discrete }) {
    const target = detail.originalEvent.target;
    const event = new CustomEvent(name, { bubbles: false, cancelable: true, detail });
    if (handler) target.addEventListener(name, handler, { once: true });
    if (discrete) {
      dispatchDiscreteCustomEvent(target, event);
    } else {
      target.dispatchEvent(event);
    }
  }
  __name13(handleAndDispatchCustomEvent, "handleAndDispatchCustomEvent");

  // node_modules/.pnpm/@radix-ui+react-focus-scope@1.1.16_@types+react-dom@19.2.3_@types+react@19.2.17__@types_688a7092b7a27f27c45d3c59450c400f/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
  init_define_import_meta_env();
  var React16 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime8 = __toESM(require_react_shim(), 1);
  var __defProp15 = Object.defineProperty;
  var __name14 = (target, value) => __defProp15(target, "name", { value, configurable: true });
  var AUTOFOCUS_ON_MOUNT = "focusScope.autoFocusOnMount";
  var AUTOFOCUS_ON_UNMOUNT = "focusScope.autoFocusOnUnmount";
  var EVENT_OPTIONS = { bubbles: false, cancelable: true };
  var FocusScope = /* @__PURE__ */ React16.forwardRef(
    /* @__PURE__ */ __name14(function FocusScope2(props, forwardedRef) {
      const {
        loop = false,
        trapped = false,
        onMountAutoFocus: onMountAutoFocusProp,
        onUnmountAutoFocus: onUnmountAutoFocusProp,
        ...scopeProps
      } = props;
      const [container, setContainer] = React16.useState(null);
      const onMountAutoFocus = useCallbackRef(onMountAutoFocusProp);
      const onUnmountAutoFocus = useCallbackRef(onUnmountAutoFocusProp);
      const lastFocusedElementRef = React16.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, setContainer);
      const focusScope = React16.useRef({
        paused: false,
        pause() {
          this.paused = true;
        },
        resume() {
          this.paused = false;
        }
      }).current;
      React16.useEffect(() => {
        if (trapped) {
          let handleFocusIn2 = function(event) {
            if (focusScope.paused || !container) return;
            const target = event.target;
            if (container.contains(target)) {
              lastFocusedElementRef.current = target;
            } else {
              focus(lastFocusedElementRef.current, { select: true });
            }
          }, handleFocusOut2 = function(event) {
            if (focusScope.paused || !container) return;
            const relatedTarget = event.relatedTarget;
            if (relatedTarget === null) return;
            if (!container.contains(relatedTarget)) {
              focus(lastFocusedElementRef.current, { select: true });
            }
          }, handleMutations2 = function(mutations) {
            const focusedElement = document.activeElement;
            if (focusedElement !== document.body) return;
            for (const mutation of mutations) {
              if (mutation.removedNodes.length > 0) focus(container);
            }
          };
          var handleFocusIn = handleFocusIn2, handleFocusOut = handleFocusOut2, handleMutations = handleMutations2;
          __name14(handleFocusIn2, "handleFocusIn");
          __name14(handleFocusOut2, "handleFocusOut");
          __name14(handleMutations2, "handleMutations");
          document.addEventListener("focusin", handleFocusIn2);
          document.addEventListener("focusout", handleFocusOut2);
          const mutationObserver = new MutationObserver(handleMutations2);
          if (container) mutationObserver.observe(container, { childList: true, subtree: true });
          return () => {
            document.removeEventListener("focusin", handleFocusIn2);
            document.removeEventListener("focusout", handleFocusOut2);
            mutationObserver.disconnect();
          };
        }
      }, [trapped, container, focusScope.paused]);
      React16.useEffect(() => {
        if (container) {
          focusScopesStack.add(focusScope);
          const previouslyFocusedElement = document.activeElement;
          const hasFocusedCandidate = container.contains(previouslyFocusedElement);
          if (!hasFocusedCandidate) {
            const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);
            container.addEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
            container.dispatchEvent(mountEvent);
            if (!mountEvent.defaultPrevented) {
              focusFirst(removeLinks(getTabbableCandidates(container)), { select: true });
              if (document.activeElement === previouslyFocusedElement) {
                focus(container);
              }
            }
          }
          return () => {
            container.removeEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
            setTimeout(() => {
              const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, EVENT_OPTIONS);
              container.addEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
              container.dispatchEvent(unmountEvent);
              if (!unmountEvent.defaultPrevented) {
                focus(previouslyFocusedElement ?? document.body, { select: true });
              }
              container.removeEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
              focusScopesStack.remove(focusScope);
            }, 0);
          };
        }
      }, [container, onMountAutoFocus, onUnmountAutoFocus, focusScope]);
      const handleKeyDown = React16.useCallback(
        (event) => {
          if (!loop && !trapped) return;
          if (focusScope.paused) return;
          const isTabKey = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
          const focusedElement = document.activeElement;
          if (isTabKey && focusedElement) {
            const container2 = event.currentTarget;
            const [first, last] = getTabbableEdges(container2);
            const hasTabbableElementsInside = first && last;
            if (!hasTabbableElementsInside) {
              if (focusedElement === container2) event.preventDefault();
            } else {
              if (!event.shiftKey && focusedElement === last) {
                event.preventDefault();
                if (loop) focus(first, { select: true });
              } else if (event.shiftKey && focusedElement === first) {
                event.preventDefault();
                if (loop) focus(last, { select: true });
              }
            }
          }
        },
        [loop, trapped, focusScope.paused]
      );
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Primitive.div, { tabIndex: -1, ...scopeProps, ref: composedRefs, onKeyDown: handleKeyDown });
    }, "FocusScope")
  );
  function focusFirst(candidates, { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      focus(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
    }
  }
  __name14(focusFirst, "focusFirst");
  function getTabbableEdges(container) {
    const candidates = getTabbableCandidates(container);
    const first = findVisible(candidates, container);
    const last = findVisible(candidates.reverse(), container);
    return [first, last];
  }
  __name14(getTabbableEdges, "getTabbableEdges");
  function getTabbableCandidates(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: /* @__PURE__ */ __name14((node) => {
        const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
        if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
        return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }, "acceptNode")
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  __name14(getTabbableCandidates, "getTabbableCandidates");
  function findVisible(elements, container) {
    const canUseCheckVisibility = typeof container.checkVisibility === "function" && container.checkVisibility({ checkVisibilityCSS: true });
    for (const element of elements) {
      const hidden = canUseCheckVisibility ? !element.checkVisibility({ checkVisibilityCSS: true }) : isHidden(element, { upTo: container });
      if (!hidden) {
        return element;
      }
    }
  }
  __name14(findVisible, "findVisible");
  function isHidden(node, { upTo }) {
    if (getComputedStyle(node).visibility === "hidden") return true;
    while (node) {
      if (upTo !== void 0 && node === upTo) return false;
      if (getComputedStyle(node).display === "none") return true;
      node = node.parentElement;
    }
    return false;
  }
  __name14(isHidden, "isHidden");
  function isSelectableInput(element) {
    return element instanceof HTMLInputElement && "select" in element;
  }
  __name14(isSelectableInput, "isSelectableInput");
  function focus(element, { select = false } = {}) {
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      element.focus({ preventScroll: true });
      if (element !== previouslyFocusedElement && isSelectableInput(element) && select)
        element.select();
    }
  }
  __name14(focus, "focus");
  var focusScopesStack = createFocusScopesStack();
  function createFocusScopesStack() {
    let stack = [];
    return {
      add(focusScope) {
        const activeFocusScope = stack[0];
        if (focusScope !== activeFocusScope) {
          activeFocusScope?.pause();
        }
        stack = arrayRemove(stack, focusScope);
        stack.unshift(focusScope);
      },
      remove(focusScope) {
        stack = arrayRemove(stack, focusScope);
        stack[0]?.resume();
      }
    };
  }
  __name14(createFocusScopesStack, "createFocusScopesStack");
  function arrayRemove(array, item) {
    const updatedArray = [...array];
    const index2 = updatedArray.indexOf(item);
    if (index2 !== -1) {
      updatedArray.splice(index2, 1);
    }
    return updatedArray;
  }
  __name14(arrayRemove, "arrayRemove");
  function removeLinks(items) {
    return items.filter((item) => item.tagName !== "A");
  }
  __name14(removeLinks, "removeLinks");

  // node_modules/.pnpm/@radix-ui+react-portal@1.1.17_@types+react-dom@19.2.3_@types+react@19.2.17__@types+reac_17de5f572cef13944a3e44b7d1e8f104/node_modules/@radix-ui/react-portal/dist/index.mjs
  init_define_import_meta_env();
  var React17 = __toESM(require_react_shim(), 1);
  var ReactDOM2 = __toESM(require_react_dom_shim(), 1);
  var import_jsx_runtime9 = __toESM(require_react_shim(), 1);
  var __defProp16 = Object.defineProperty;
  var __name15 = (target, value) => __defProp16(target, "name", { value, configurable: true });
  var Portal = /* @__PURE__ */ React17.forwardRef(
    /* @__PURE__ */ __name15(function Portal2(props, forwardedRef) {
      const { container: containerProp, ...portalProps } = props;
      const [mounted, setMounted] = React17.useState(false);
      useLayoutEffect2(() => setMounted(true), []);
      const container = containerProp || mounted && globalThis?.document?.body;
      return container ? ReactDOM2.createPortal(/* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Primitive.div, { ...portalProps, ref: forwardedRef }), container) : null;
    }, "Portal")
  );

  // node_modules/.pnpm/@radix-ui+react-focus-guards@1.1.6_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
  init_define_import_meta_env();
  var React18 = __toESM(require_react_shim(), 1);
  var __defProp17 = Object.defineProperty;
  var __name16 = (target, value) => __defProp17(target, "name", { value, configurable: true });
  var count2 = 0;
  var guards = null;
  function FocusGuards(props) {
    useFocusGuards();
    return props.children;
  }
  __name16(FocusGuards, "FocusGuards");
  function useFocusGuards() {
    React18.useEffect(() => {
      if (!guards) {
        guards = { start: createFocusGuard(), end: createFocusGuard() };
      }
      const { start, end } = guards;
      if (document.body.firstElementChild !== start) {
        document.body.insertAdjacentElement("afterbegin", start);
      }
      if (document.body.lastElementChild !== end) {
        document.body.insertAdjacentElement("beforeend", end);
      }
      count2++;
      return () => {
        if (count2 === 1) {
          guards?.start.remove();
          guards?.end.remove();
          guards = null;
        }
        count2 = Math.max(0, count2 - 1);
      };
    }, []);
  }
  __name16(useFocusGuards, "useFocusGuards");
  function createFocusGuard() {
    const element = document.createElement("span");
    element.setAttribute("data-radix-focus-guard", "");
    element.tabIndex = 0;
    element.style.outline = "none";
    element.style.opacity = "0";
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    return element;
  }
  __name16(createFocusGuard, "createFocusGuard");

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/Combination.js
  init_define_import_meta_env();

  // node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
  init_define_import_meta_env();
  var __assign = function() {
    __assign = Object.assign || function __assign2(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  }
  function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
        if (!ar) ar = Array.prototype.slice.call(from, 0, i);
        ar[i] = from[i];
      }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
  }

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var React28 = __toESM(require_react_shim());

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/UI.js
  init_define_import_meta_env();
  var React21 = __toESM(require_react_shim());

  // node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
  init_define_import_meta_env();
  var zeroRightClassName = "right-scroll-bar-position";
  var fullWidthClassName = "width-before-scroll-bar";
  var noScrollbarsClassName = "with-scroll-bars-hidden";
  var removedBarSizeVariable = "--removed-body-scroll-bar-size";

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@19.2.17_react@19.2.8/node_modules/use-callback-ref/dist/es2015/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@19.2.17_react@19.2.8/node_modules/use-callback-ref/dist/es2015/assignRef.js
  init_define_import_meta_env();
  function assignRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
    return ref;
  }

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@19.2.17_react@19.2.8/node_modules/use-callback-ref/dist/es2015/useRef.js
  init_define_import_meta_env();
  var import_react = __toESM(require_react_shim());
  function useCallbackRef2(initialValue, callback) {
    var ref = (0, import_react.useState)(function() {
      return {
        // value
        value: initialValue,
        // last callback
        callback,
        // "memoized" public interface
        facade: {
          get current() {
            return ref.value;
          },
          set current(value) {
            var last = ref.value;
            if (last !== value) {
              ref.value = value;
              ref.callback(value, last);
            }
          }
        }
      };
    })[0];
    ref.callback = callback;
    return ref.facade;
  }

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@19.2.17_react@19.2.8/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
  init_define_import_meta_env();
  var React19 = __toESM(require_react_shim());
  var useIsomorphicLayoutEffect = typeof window !== "undefined" ? React19.useLayoutEffect : React19.useEffect;
  var currentValues = /* @__PURE__ */ new WeakMap();
  function useMergeRefs(refs, defaultValue) {
    var callbackRef = useCallbackRef2(defaultValue || null, function(newValue) {
      return refs.forEach(function(ref) {
        return assignRef(ref, newValue);
      });
    });
    useIsomorphicLayoutEffect(function() {
      var oldValue = currentValues.get(callbackRef);
      if (oldValue) {
        var prevRefs_1 = new Set(oldValue);
        var nextRefs_1 = new Set(refs);
        var current_1 = callbackRef.current;
        prevRefs_1.forEach(function(ref) {
          if (!nextRefs_1.has(ref)) {
            assignRef(ref, null);
          }
        });
        nextRefs_1.forEach(function(ref) {
          if (!prevRefs_1.has(ref)) {
            assignRef(ref, current_1);
          }
        });
      }
      currentValues.set(callbackRef, refs);
    }, [refs]);
    return callbackRef;
  }

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/medium.js
  init_define_import_meta_env();

  // node_modules/.pnpm/use-sidecar@1.1.3_@types+react@19.2.17_react@19.2.8/node_modules/use-sidecar/dist/es2015/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/use-sidecar@1.1.3_@types+react@19.2.17_react@19.2.8/node_modules/use-sidecar/dist/es2015/medium.js
  init_define_import_meta_env();
  function ItoI(a) {
    return a;
  }
  function innerCreateMedium(defaults, middleware) {
    if (middleware === void 0) {
      middleware = ItoI;
    }
    var buffer = [];
    var assigned = false;
    var medium = {
      read: function() {
        if (assigned) {
          throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
        }
        if (buffer.length) {
          return buffer[buffer.length - 1];
        }
        return defaults;
      },
      useMedium: function(data) {
        var item = middleware(data, assigned);
        buffer.push(item);
        return function() {
          buffer = buffer.filter(function(x) {
            return x !== item;
          });
        };
      },
      assignSyncMedium: function(cb) {
        assigned = true;
        while (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
        }
        buffer = {
          push: function(x) {
            return cb(x);
          },
          filter: function() {
            return buffer;
          }
        };
      },
      assignMedium: function(cb) {
        assigned = true;
        var pendingQueue = [];
        if (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
          pendingQueue = buffer;
        }
        var executeQueue = function() {
          var cbs2 = pendingQueue;
          pendingQueue = [];
          cbs2.forEach(cb);
        };
        var cycle = function() {
          return Promise.resolve().then(executeQueue);
        };
        cycle();
        buffer = {
          push: function(x) {
            pendingQueue.push(x);
            cycle();
          },
          filter: function(filter) {
            pendingQueue = pendingQueue.filter(filter);
            return buffer;
          }
        };
      }
    };
    return medium;
  }
  function createSidecarMedium(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    var medium = innerCreateMedium(null);
    medium.options = __assign({ async: true, ssr: false }, options2);
    return medium;
  }

  // node_modules/.pnpm/use-sidecar@1.1.3_@types+react@19.2.17_react@19.2.8/node_modules/use-sidecar/dist/es2015/exports.js
  init_define_import_meta_env();
  var React20 = __toESM(require_react_shim());
  var SideCar = function(_a2) {
    var sideCar = _a2.sideCar, rest = __rest(_a2, ["sideCar"]);
    if (!sideCar) {
      throw new Error("Sidecar: please provide `sideCar` property to import the right car");
    }
    var Target = sideCar.read();
    if (!Target) {
      throw new Error("Sidecar medium not found");
    }
    return React20.createElement(Target, __assign({}, rest));
  };
  SideCar.isSideCarExport = true;
  function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
  }

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/medium.js
  var effectCar = createSidecarMedium();

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/UI.js
  var nothing = function() {
    return;
  };
  var RemoveScroll = React21.forwardRef(function(props, parentRef) {
    var ref = React21.useRef(null);
    var _a2 = React21.useState({
      onScrollCapture: nothing,
      onWheelCapture: nothing,
      onTouchMoveCapture: nothing
    }), callbacks = _a2[0], setCallbacks = _a2[1];
    var forwardProps = props.forwardProps, children = props.children, className = props.className, removeScrollBar = props.removeScrollBar, enabled = props.enabled, shards = props.shards, sideCar = props.sideCar, noRelative = props.noRelative, noIsolation = props.noIsolation, inert = props.inert, allowPinchZoom = props.allowPinchZoom, _b = props.as, Container = _b === void 0 ? "div" : _b, gapMode = props.gapMode, rest = __rest(props, ["forwardProps", "children", "className", "removeScrollBar", "enabled", "shards", "sideCar", "noRelative", "noIsolation", "inert", "allowPinchZoom", "as", "gapMode"]);
    var SideCar2 = sideCar;
    var containerRef = useMergeRefs([ref, parentRef]);
    var containerProps = __assign(__assign({}, rest), callbacks);
    return React21.createElement(
      React21.Fragment,
      null,
      enabled && React21.createElement(SideCar2, { sideCar: effectCar, removeScrollBar, shards, noRelative, noIsolation, inert, setCallbacks, allowPinchZoom: !!allowPinchZoom, lockRef: ref, gapMode }),
      forwardProps ? React21.cloneElement(React21.Children.only(children), __assign(__assign({}, containerProps), { ref: containerRef })) : React21.createElement(Container, __assign({}, containerProps, { className, ref: containerRef }), children)
    );
  });
  RemoveScroll.defaultProps = {
    enabled: true,
    removeScrollBar: true,
    inert: false
  };
  RemoveScroll.classNames = {
    fullWidth: fullWidthClassName,
    zeroRight: zeroRightClassName
  };

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
  init_define_import_meta_env();
  var React27 = __toESM(require_react_shim());

  // node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll-bar/dist/es2015/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  init_define_import_meta_env();
  var React26 = __toESM(require_react_shim());

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/component.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/hook.js
  init_define_import_meta_env();
  var React25 = __toESM(require_react_shim());

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/singleton.js
  init_define_import_meta_env();

  // node_modules/.pnpm/get-nonce@1.0.1/node_modules/get-nonce/dist/es2015/index.js
  init_define_import_meta_env();
  var currentNonce;
  var getNonce = function() {
    if (currentNonce) {
      return currentNonce;
    }
    if (typeof __webpack_nonce__ !== "undefined") {
      return __webpack_nonce__;
    }
    return void 0;
  };

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/singleton.js
  function makeStyleTag() {
    if (!document)
      return null;
    var tag = document.createElement("style");
    tag.type = "text/css";
    var nonce = getNonce();
    if (nonce) {
      tag.setAttribute("nonce", nonce);
    }
    return tag;
  }
  function injectStyles(tag, css) {
    if (tag.styleSheet) {
      tag.styleSheet.cssText = css;
    } else {
      tag.appendChild(document.createTextNode(css));
    }
  }
  function insertStyleTag(tag) {
    var head = document.head || document.getElementsByTagName("head")[0];
    head.appendChild(tag);
  }
  var stylesheetSingleton = function() {
    var counter = 0;
    var stylesheet = null;
    return {
      add: function(style) {
        if (counter == 0) {
          if (stylesheet = makeStyleTag()) {
            injectStyles(stylesheet, style);
            insertStyleTag(stylesheet);
          }
        }
        counter++;
      },
      remove: function() {
        counter--;
        if (!counter && stylesheet) {
          stylesheet.parentNode && stylesheet.parentNode.removeChild(stylesheet);
          stylesheet = null;
        }
      }
    };
  };

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/hook.js
  var styleHookSingleton = function() {
    var sheet = stylesheetSingleton();
    return function(styles, isDynamic) {
      React25.useEffect(function() {
        sheet.add(styles);
        return function() {
          sheet.remove();
        };
      }, [styles && isDynamic]);
    };
  };

  // node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@19.2.17_react@19.2.8/node_modules/react-style-singleton/dist/es2015/component.js
  var styleSingleton = function() {
    var useStyle = styleHookSingleton();
    var Sheet = function(_a2) {
      var styles = _a2.styles, dynamic = _a2.dynamic;
      useStyle(styles, dynamic);
      return null;
    };
    return Sheet;
  };

  // node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll-bar/dist/es2015/utils.js
  init_define_import_meta_env();
  var zeroGap = {
    left: 0,
    top: 0,
    right: 0,
    gap: 0
  };
  var parse = function(x) {
    return parseInt(x || "", 10) || 0;
  };
  var getOffset = function(gapMode) {
    var cs = window.getComputedStyle(document.body);
    var left = cs[gapMode === "padding" ? "paddingLeft" : "marginLeft"];
    var top = cs[gapMode === "padding" ? "paddingTop" : "marginTop"];
    var right = cs[gapMode === "padding" ? "paddingRight" : "marginRight"];
    return [parse(left), parse(top), parse(right)];
  };
  var getGapWidth = function(gapMode) {
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    if (typeof window === "undefined") {
      return zeroGap;
    }
    var offsets = getOffset(gapMode);
    var documentWidth = document.documentElement.clientWidth;
    var windowWidth = window.innerWidth;
    return {
      left: offsets[0],
      top: offsets[1],
      right: offsets[2],
      gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0])
    };
  };

  // node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  var Style = styleSingleton();
  var lockAttribute = "data-scroll-locked";
  var getStyles = function(_a2, allowRelative, gapMode, important) {
    var left = _a2.left, top = _a2.top, right = _a2.right, gap = _a2.gap;
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    return "\n  .".concat(noScrollbarsClassName, " {\n   overflow: hidden ").concat(important, ";\n   padding-right: ").concat(gap, "px ").concat(important, ";\n  }\n  body[").concat(lockAttribute, "] {\n    overflow: hidden ").concat(important, ";\n    overscroll-behavior: contain;\n    ").concat([
      allowRelative && "position: relative ".concat(important, ";"),
      gapMode === "margin" && "\n    padding-left: ".concat(left, "px;\n    padding-top: ").concat(top, "px;\n    padding-right: ").concat(right, "px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ").concat(gap, "px ").concat(important, ";\n    "),
      gapMode === "padding" && "padding-right: ".concat(gap, "px ").concat(important, ";")
    ].filter(Boolean).join(""), "\n  }\n  \n  .").concat(zeroRightClassName, " {\n    right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " {\n    margin-right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(zeroRightClassName, " .").concat(zeroRightClassName, " {\n    right: 0 ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " .").concat(fullWidthClassName, " {\n    margin-right: 0 ").concat(important, ";\n  }\n  \n  body[").concat(lockAttribute, "] {\n    ").concat(removedBarSizeVariable, ": ").concat(gap, "px;\n  }\n");
  };
  var getCurrentUseCounter = function() {
    var counter = parseInt(document.body.getAttribute(lockAttribute) || "0", 10);
    return isFinite(counter) ? counter : 0;
  };
  var useLockAttribute = function() {
    React26.useEffect(function() {
      document.body.setAttribute(lockAttribute, (getCurrentUseCounter() + 1).toString());
      return function() {
        var newCounter = getCurrentUseCounter() - 1;
        if (newCounter <= 0) {
          document.body.removeAttribute(lockAttribute);
        } else {
          document.body.setAttribute(lockAttribute, newCounter.toString());
        }
      };
    }, []);
  };
  var RemoveScrollBar = function(_a2) {
    var noRelative = _a2.noRelative, noImportant = _a2.noImportant, _b = _a2.gapMode, gapMode = _b === void 0 ? "margin" : _b;
    useLockAttribute();
    var gap = React26.useMemo(function() {
      return getGapWidth(gapMode);
    }, [gapMode]);
    return React26.createElement(Style, { styles: getStyles(gap, !noRelative, gapMode, !noImportant ? "!important" : "") });
  };

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/aggresiveCapture.js
  init_define_import_meta_env();
  var passiveSupported = false;
  if (typeof window !== "undefined") {
    try {
      options = Object.defineProperty({}, "passive", {
        get: function() {
          passiveSupported = true;
          return true;
        }
      });
      window.addEventListener("test", options, options);
      window.removeEventListener("test", options, options);
    } catch (err) {
      passiveSupported = false;
    }
  }
  var options;
  var nonPassive = passiveSupported ? { passive: false } : false;

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/handleScroll.js
  init_define_import_meta_env();
  var alwaysContainsScroll = function(node) {
    return node.tagName === "TEXTAREA";
  };
  var elementCanBeScrolled = function(node, overflow) {
    if (!(node instanceof Element)) {
      return false;
    }
    var styles = window.getComputedStyle(node);
    return (
      // not-not-scrollable
      styles[overflow] !== "hidden" && // contains scroll inside self
      !(styles.overflowY === styles.overflowX && !alwaysContainsScroll(node) && styles[overflow] === "visible")
    );
  };
  var elementCouldBeVScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowY");
  };
  var elementCouldBeHScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowX");
  };
  var locationCouldBeScrolled = function(axis, node) {
    var ownerDocument = node.ownerDocument;
    var current = node;
    do {
      if (typeof ShadowRoot !== "undefined" && current instanceof ShadowRoot) {
        current = current.host;
      }
      var isScrollable = elementCouldBeScrolled(axis, current);
      if (isScrollable) {
        var _a2 = getScrollVariables(axis, current), scrollHeight = _a2[1], clientHeight = _a2[2];
        if (scrollHeight > clientHeight) {
          return true;
        }
      }
      current = current.parentNode;
    } while (current && current !== ownerDocument.body);
    return false;
  };
  var getVScrollVariables = function(_a2) {
    var scrollTop = _a2.scrollTop, scrollHeight = _a2.scrollHeight, clientHeight = _a2.clientHeight;
    return [
      scrollTop,
      scrollHeight,
      clientHeight
    ];
  };
  var getHScrollVariables = function(_a2) {
    var scrollLeft = _a2.scrollLeft, scrollWidth = _a2.scrollWidth, clientWidth = _a2.clientWidth;
    return [
      scrollLeft,
      scrollWidth,
      clientWidth
    ];
  };
  var elementCouldBeScrolled = function(axis, node) {
    return axis === "v" ? elementCouldBeVScrolled(node) : elementCouldBeHScrolled(node);
  };
  var getScrollVariables = function(axis, node) {
    return axis === "v" ? getVScrollVariables(node) : getHScrollVariables(node);
  };
  var getDirectionFactor = function(axis, direction) {
    return axis === "h" && direction === "rtl" ? -1 : 1;
  };
  var handleScroll = function(axis, endTarget, event, sourceDelta, noOverscroll) {
    var directionFactor = getDirectionFactor(axis, window.getComputedStyle(endTarget).direction);
    var delta = directionFactor * sourceDelta;
    var target = event.target;
    var targetInLock = endTarget.contains(target);
    var shouldCancelScroll = false;
    var isDeltaPositive = delta > 0;
    var availableScroll = 0;
    var availableScrollTop = 0;
    do {
      if (!target) {
        break;
      }
      var _a2 = getScrollVariables(axis, target), position = _a2[0], scroll_1 = _a2[1], capacity = _a2[2];
      var elementScroll = scroll_1 - capacity - directionFactor * position;
      if (position || elementScroll) {
        if (elementCouldBeScrolled(axis, target)) {
          availableScroll += elementScroll;
          availableScrollTop += position;
        }
      }
      var parent_1 = target.parentNode;
      target = parent_1 && parent_1.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent_1.host : parent_1;
    } while (
      // portaled content
      !targetInLock && target !== document.body || // self content
      targetInLock && (endTarget.contains(target) || endTarget === target)
    );
    if (isDeltaPositive && (noOverscroll && Math.abs(availableScroll) < 1 || !noOverscroll && delta > availableScroll)) {
      shouldCancelScroll = true;
    } else if (!isDeltaPositive && (noOverscroll && Math.abs(availableScrollTop) < 1 || !noOverscroll && -delta > availableScrollTop)) {
      shouldCancelScroll = true;
    }
    return shouldCancelScroll;
  };

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
  var getTouchXY = function(event) {
    return "changedTouches" in event ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
  };
  var getDeltaXY = function(event) {
    return [event.deltaX, event.deltaY];
  };
  var extractRef = function(ref) {
    return ref && "current" in ref ? ref.current : ref;
  };
  var deltaCompare = function(x, y) {
    return x[0] === y[0] && x[1] === y[1];
  };
  var generateStyle = function(id) {
    return "\n  .block-interactivity-".concat(id, " {pointer-events: none;}\n  .allow-interactivity-").concat(id, " {pointer-events: all;}\n");
  };
  var idCounter = 0;
  var lockStack = [];
  function RemoveScrollSideCar(props) {
    var shouldPreventQueue = React27.useRef([]);
    var touchStartRef = React27.useRef([0, 0]);
    var activeAxis = React27.useRef();
    var id = React27.useState(idCounter++)[0];
    var Style2 = React27.useState(styleSingleton)[0];
    var lastProps = React27.useRef(props);
    React27.useEffect(function() {
      lastProps.current = props;
    }, [props]);
    React27.useEffect(function() {
      if (props.inert) {
        document.body.classList.add("block-interactivity-".concat(id));
        var allow_1 = __spreadArray([props.lockRef.current], (props.shards || []).map(extractRef), true).filter(Boolean);
        allow_1.forEach(function(el) {
          return el.classList.add("allow-interactivity-".concat(id));
        });
        return function() {
          document.body.classList.remove("block-interactivity-".concat(id));
          allow_1.forEach(function(el) {
            return el.classList.remove("allow-interactivity-".concat(id));
          });
        };
      }
      return;
    }, [props.inert, props.lockRef.current, props.shards]);
    var shouldCancelEvent = React27.useCallback(function(event, parent) {
      if ("touches" in event && event.touches.length === 2 || event.type === "wheel" && event.ctrlKey) {
        return !lastProps.current.allowPinchZoom;
      }
      var touch = getTouchXY(event);
      var touchStart = touchStartRef.current;
      var deltaX = "deltaX" in event ? event.deltaX : touchStart[0] - touch[0];
      var deltaY = "deltaY" in event ? event.deltaY : touchStart[1] - touch[1];
      var currentAxis;
      var target = event.target;
      var moveDirection = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      if ("touches" in event && moveDirection === "h" && target.type === "range") {
        return false;
      }
      var selection = window.getSelection();
      var anchorNode = selection && selection.anchorNode;
      var isTouchingSelection = anchorNode ? anchorNode === target || anchorNode.contains(target) : false;
      if (isTouchingSelection) {
        return false;
      }
      var canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      if (!canBeScrolledInMainDirection) {
        return true;
      }
      if (canBeScrolledInMainDirection) {
        currentAxis = moveDirection;
      } else {
        currentAxis = moveDirection === "v" ? "h" : "v";
        canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      }
      if (!canBeScrolledInMainDirection) {
        return false;
      }
      if (!activeAxis.current && "changedTouches" in event && (deltaX || deltaY)) {
        activeAxis.current = currentAxis;
      }
      if (!currentAxis) {
        return true;
      }
      var cancelingAxis = activeAxis.current || currentAxis;
      return handleScroll(cancelingAxis, parent, event, cancelingAxis === "h" ? deltaX : deltaY, true);
    }, []);
    var shouldPrevent = React27.useCallback(function(_event) {
      var event = _event;
      if (!lockStack.length || lockStack[lockStack.length - 1] !== Style2) {
        return;
      }
      var delta = "deltaY" in event ? getDeltaXY(event) : getTouchXY(event);
      var sourceEvent = shouldPreventQueue.current.filter(function(e) {
        return e.name === event.type && (e.target === event.target || event.target === e.shadowParent) && deltaCompare(e.delta, delta);
      })[0];
      if (sourceEvent && sourceEvent.should) {
        if (event.cancelable) {
          event.preventDefault();
        }
        return;
      }
      if (!sourceEvent) {
        var shardNodes = (lastProps.current.shards || []).map(extractRef).filter(Boolean).filter(function(node) {
          return node.contains(event.target);
        });
        var shouldStop = shardNodes.length > 0 ? shouldCancelEvent(event, shardNodes[0]) : !lastProps.current.noIsolation;
        if (shouldStop) {
          if (event.cancelable) {
            event.preventDefault();
          }
        }
      }
    }, []);
    var shouldCancel = React27.useCallback(function(name, delta, target, should) {
      var event = { name, delta, target, should, shadowParent: getOutermostShadowParent(target) };
      shouldPreventQueue.current.push(event);
      setTimeout(function() {
        shouldPreventQueue.current = shouldPreventQueue.current.filter(function(e) {
          return e !== event;
        });
      }, 1);
    }, []);
    var scrollTouchStart = React27.useCallback(function(event) {
      touchStartRef.current = getTouchXY(event);
      activeAxis.current = void 0;
    }, []);
    var scrollWheel = React27.useCallback(function(event) {
      shouldCancel(event.type, getDeltaXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    var scrollTouchMove = React27.useCallback(function(event) {
      shouldCancel(event.type, getTouchXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    React27.useEffect(function() {
      lockStack.push(Style2);
      props.setCallbacks({
        onScrollCapture: scrollWheel,
        onWheelCapture: scrollWheel,
        onTouchMoveCapture: scrollTouchMove
      });
      document.addEventListener("wheel", shouldPrevent, nonPassive);
      document.addEventListener("touchmove", shouldPrevent, nonPassive);
      document.addEventListener("touchstart", scrollTouchStart, nonPassive);
      return function() {
        lockStack = lockStack.filter(function(inst) {
          return inst !== Style2;
        });
        document.removeEventListener("wheel", shouldPrevent, nonPassive);
        document.removeEventListener("touchmove", shouldPrevent, nonPassive);
        document.removeEventListener("touchstart", scrollTouchStart, nonPassive);
      };
    }, []);
    var removeScrollBar = props.removeScrollBar, inert = props.inert;
    return React27.createElement(
      React27.Fragment,
      null,
      inert ? React27.createElement(Style2, { styles: generateStyle(id) }) : null,
      removeScrollBar ? React27.createElement(RemoveScrollBar, { noRelative: props.noRelative, gapMode: props.gapMode }) : null
    );
  }
  function getOutermostShadowParent(node) {
    var shadowParent = null;
    while (node !== null) {
      if (node instanceof ShadowRoot) {
        shadowParent = node.host;
        node = node.host;
      }
      node = node.parentNode;
    }
    return shadowParent;
  }

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  var sidecar_default = exportSidecar(effectCar, RemoveScrollSideCar);

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@19.2.17_react@19.2.8/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var ReactRemoveScroll = React28.forwardRef(function(props, ref) {
    return React28.createElement(RemoveScroll, __assign({}, props, { ref, sideCar: sidecar_default }));
  });
  ReactRemoveScroll.classNames = RemoveScroll.classNames;
  var Combination_default = ReactRemoveScroll;

  // node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js
  init_define_import_meta_env();
  var getDefaultParent = function(originalTarget) {
    if (typeof document === "undefined") {
      return null;
    }
    var sampleTarget = Array.isArray(originalTarget) ? originalTarget[0] : originalTarget;
    return sampleTarget.ownerDocument.body;
  };
  var counterMap = /* @__PURE__ */ new WeakMap();
  var uncontrolledNodes = /* @__PURE__ */ new WeakMap();
  var markerMap = {};
  var lockCount = 0;
  var unwrapHost = function(node) {
    return node && (node.host || unwrapHost(node.parentNode));
  };
  var correctTargets = function(parent, targets) {
    return targets.map(function(target) {
      if (parent.contains(target)) {
        return target;
      }
      var correctedTarget = unwrapHost(target);
      if (correctedTarget && parent.contains(correctedTarget)) {
        return correctedTarget;
      }
      console.error("aria-hidden", target, "in not contained inside", parent, ". Doing nothing");
      return null;
    }).filter(function(x) {
      return Boolean(x);
    });
  };
  var applyAttributeToOthers = function(originalTarget, parentNode, markerName, controlAttribute) {
    var targets = correctTargets(parentNode, Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    if (!markerMap[markerName]) {
      markerMap[markerName] = /* @__PURE__ */ new WeakMap();
    }
    var markerCounter = markerMap[markerName];
    var hiddenNodes = [];
    var elementsToKeep = /* @__PURE__ */ new Set();
    var elementsToStop = new Set(targets);
    var keep = function(el) {
      if (!el || elementsToKeep.has(el)) {
        return;
      }
      elementsToKeep.add(el);
      keep(el.parentNode);
    };
    targets.forEach(keep);
    var deep = function(parent) {
      if (!parent || elementsToStop.has(parent)) {
        return;
      }
      Array.prototype.forEach.call(parent.children, function(node) {
        if (elementsToKeep.has(node)) {
          deep(node);
        } else {
          try {
            var attr = node.getAttribute(controlAttribute);
            var alreadyHidden = attr !== null && attr !== "false";
            var counterValue = (counterMap.get(node) || 0) + 1;
            var markerValue = (markerCounter.get(node) || 0) + 1;
            counterMap.set(node, counterValue);
            markerCounter.set(node, markerValue);
            hiddenNodes.push(node);
            if (counterValue === 1 && alreadyHidden) {
              uncontrolledNodes.set(node, true);
            }
            if (markerValue === 1) {
              node.setAttribute(markerName, "true");
            }
            if (!alreadyHidden) {
              node.setAttribute(controlAttribute, "true");
            }
          } catch (e) {
            console.error("aria-hidden: cannot operate on ", node, e);
          }
        }
      });
    };
    deep(parentNode);
    elementsToKeep.clear();
    lockCount++;
    return function() {
      hiddenNodes.forEach(function(node) {
        var counterValue = counterMap.get(node) - 1;
        var markerValue = markerCounter.get(node) - 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        if (!counterValue) {
          if (!uncontrolledNodes.has(node)) {
            node.removeAttribute(controlAttribute);
          }
          uncontrolledNodes.delete(node);
        }
        if (!markerValue) {
          node.removeAttribute(markerName);
        }
      });
      lockCount--;
      if (!lockCount) {
        counterMap = /* @__PURE__ */ new WeakMap();
        counterMap = /* @__PURE__ */ new WeakMap();
        uncontrolledNodes = /* @__PURE__ */ new WeakMap();
        markerMap = {};
      }
    };
  };
  var hideOthers = function(originalTarget, parentNode, markerName) {
    if (markerName === void 0) {
      markerName = "data-aria-hidden";
    }
    var targets = Array.from(Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    var activeParentNode = parentNode || getDefaultParent(originalTarget);
    if (!activeParentNode) {
      return function() {
        return null;
      };
    }
    targets.push.apply(targets, Array.from(activeParentNode.querySelectorAll("[aria-live], script")));
    return applyAttributeToOthers(targets, activeParentNode, markerName, "aria-hidden");
  };

  // node_modules/.pnpm/@radix-ui+react-dialog@1.1.23_@types+react-dom@19.2.3_@types+react@19.2.17__@types+reac_ebeaa069aac513f5f318f7d1d5f561bf/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var import_jsx_runtime10 = __toESM(require_react_shim(), 1);
  var __defProp18 = Object.defineProperty;
  var __name17 = (target, value) => __defProp18(target, "name", { value, configurable: true });
  var DIALOG_NAME = "Dialog";
  var [createDialogContext, createDialogScope] = createContextScope(DIALOG_NAME);
  var [DialogProvider, useDialogContext] = createDialogContext(DIALOG_NAME);
  var Dialog = /* @__PURE__ */ __name17((props) => {
    const {
      __scopeDialog,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const triggerRef = React29.useRef(null);
    const contentRef = React29.useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DIALOG_NAME
    });
    const [titleCount, setTitleCount] = React29.useState(0);
    const [descriptionCount, setDescriptionCount] = React29.useState(0);
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      DialogProvider,
      {
        scope: __scopeDialog,
        triggerRef,
        contentRef,
        contentId: useId(),
        titleId: useId(),
        descriptionId: useId(),
        titlePresent: titleCount > 0,
        descriptionPresent: descriptionCount > 0,
        setTitleCount,
        setDescriptionCount,
        open,
        onOpenChange: setOpen,
        onOpenToggle: React29.useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children
      }
    );
  }, "Dialog");
  var TRIGGER_NAME = "DialogTrigger";
  var DialogTrigger = /* @__PURE__ */ React29.forwardRef(
    /* @__PURE__ */ __name17(function DialogTrigger2(props, forwardedRef) {
      const { __scopeDialog, ...triggerProps } = props;
      const context = useDialogContext(TRIGGER_NAME, __scopeDialog);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        Primitive.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
    }, "DialogTrigger")
  );
  var PORTAL_NAME = "DialogPortal";
  var [PortalProvider, usePortalContext] = createDialogContext(PORTAL_NAME, {
    forceMount: void 0
  });
  var DialogPortal = /* @__PURE__ */ __name17((props) => {
    const { __scopeDialog, forceMount, children, container } = props;
    const context = useDialogContext(PORTAL_NAME, __scopeDialog);
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PortalProvider, { scope: __scopeDialog, forceMount, children: React29.Children.map(children, (child) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Portal, { asChild: true, container, children: child }) })) });
  }, "DialogPortal");
  var OVERLAY_NAME = "DialogOverlay";
  var DialogOverlay = /* @__PURE__ */ React29.forwardRef(
    /* @__PURE__ */ __name17(function DialogOverlay2(props, forwardedRef) {
      const portalContext = usePortalContext(OVERLAY_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, props.__scopeDialog);
      return context.modal ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(DialogOverlayImpl, { ...overlayProps, ref: forwardedRef }) }) : null;
    }, "DialogOverlay")
  );
  var Slot2 = createSlot("DialogOverlay.RemoveScroll");
  var DialogOverlayImpl = /* @__PURE__ */ React29.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name17(function DialogOverlayImpl2(props, forwardedRef) {
      const { __scopeDialog, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, __scopeDialog);
      const registerDismissableSurface = useDismissableLayerSurface();
      const composedRefs = useComposedRefs(forwardedRef, registerDismissableSurface);
      return (
        // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
        // ie. when `Overlay` and `Content` are siblings
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Combination_default, { as: Slot2, allowPinchZoom: true, shards: [context.contentRef], children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          Primitive.div,
          {
            "data-state": getState(context.open),
            ...overlayProps,
            ref: composedRefs,
            style: { pointerEvents: "auto", ...overlayProps.style }
          }
        ) })
      );
    }, "DialogOverlayImpl")
  );
  var CONTENT_NAME = "DialogContent";
  var DialogContent = /* @__PURE__ */ React29.forwardRef(
    /* @__PURE__ */ __name17(function DialogContent2(props, forwardedRef) {
      const portalContext = usePortalContext(CONTENT_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(DialogContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(DialogContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }, "DialogContent")
  );
  var DialogContentModal = /* @__PURE__ */ React29.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name17(function DialogContentModal2(props, forwardedRef) {
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      const contentRef = React29.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, context.contentRef, contentRef);
      React29.useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        DialogContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers(props.onPointerDownOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (isRightClick) event.preventDefault();
          }),
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault()
          )
        }
      );
    }, "DialogContentModal")
  );
  var DialogContentNonModal = /* @__PURE__ */ React29.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name17(function DialogContentNonModal2(props, forwardedRef) {
      const context = useDialogContext(CONTENT_NAME, props.__scopeDialog);
      const hasInteractedOutsideRef = React29.useRef(false);
      const hasPointerDownOutsideRef = React29.useRef(false);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        DialogContentImpl,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }, "DialogContentNonModal")
  );
  var DialogContentImpl = /* @__PURE__ */ React29.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name17(function DialogContentImpl2(props, forwardedRef) {
      const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME, __scopeDialog);
      useFocusGuards();
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_jsx_runtime10.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        FocusScope,
        {
          asChild: true,
          loop: true,
          trapped: trapFocus,
          onMountAutoFocus: onOpenAutoFocus,
          onUnmountAutoFocus: onCloseAutoFocus,
          children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            DismissableLayer,
            {
              role: "dialog",
              id: context.contentId,
              "aria-describedby": context.descriptionPresent ? context.descriptionId : void 0,
              "aria-labelledby": context.titlePresent ? context.titleId : void 0,
              "data-state": getState(context.open),
              ...contentProps,
              ref: forwardedRef,
              deferPointerDownOutside: true,
              onDismiss: () => context.onOpenChange(false)
            }
          )
        }
      ) });
    }, "DialogContentImpl")
  );
  var TITLE_NAME = "DialogTitle";
  var DialogTitle = /* @__PURE__ */ React29.forwardRef(
    /* @__PURE__ */ __name17(function DialogTitle2(props, forwardedRef) {
      const { __scopeDialog, ...titleProps } = props;
      const context = useDialogContext(TITLE_NAME, __scopeDialog);
      const { setTitleCount } = context;
      useLayoutEffect2(() => {
        setTitleCount((count3) => count3 + 1);
        return () => setTitleCount((count3) => count3 - 1);
      }, [setTitleCount]);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Primitive.h2, { id: context.titleId, ...titleProps, ref: forwardedRef });
    }, "DialogTitle")
  );
  var DESCRIPTION_NAME = "DialogDescription";
  var DialogDescription = /* @__PURE__ */ React29.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name17(function DialogDescription2(props, forwardedRef) {
      const { __scopeDialog, ...descriptionProps } = props;
      const context = useDialogContext(DESCRIPTION_NAME, __scopeDialog);
      const { setDescriptionCount } = context;
      useLayoutEffect2(() => {
        setDescriptionCount((count3) => count3 + 1);
        return () => setDescriptionCount((count3) => count3 - 1);
      }, [setDescriptionCount]);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Primitive.p, { id: context.descriptionId, ...descriptionProps, ref: forwardedRef });
    }, "DialogDescription")
  );
  var CLOSE_NAME = "DialogClose";
  var DialogClose = /* @__PURE__ */ React29.forwardRef(
    /* @__PURE__ */ __name17(function DialogClose2(props, forwardedRef) {
      const { __scopeDialog, ...closeProps } = props;
      const context = useDialogContext(CLOSE_NAME, __scopeDialog);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        Primitive.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, () => context.onOpenChange(false))
        }
      );
    }, "DialogClose")
  );
  var WarningProvider = /* @__PURE__ */ __name17((props) => {
    return props.children;
  }, "WarningProvider");
  function getState(open) {
    return open ? "open" : "closed";
  }
  __name17(getState, "getState");

  // node_modules/.pnpm/@radix-ui+react-checkbox@1.3.11_@types+react-dom@19.2.3_@types+react@19.2.17__@types+re_f6e0f4835f2e28dbd2e5cb3844d005eb/node_modules/@radix-ui/react-checkbox/dist/index.mjs
  var dist_exports3 = {};
  __export(dist_exports3, {
    Checkbox: () => Checkbox,
    CheckboxIndicator: () => CheckboxIndicator,
    Indicator: () => CheckboxIndicator,
    Root: () => Checkbox,
    createCheckboxScope: () => createCheckboxScope,
    unstable_BubbleInput: () => CheckboxBubbleInput,
    unstable_CheckboxBubbleInput: () => CheckboxBubbleInput,
    unstable_CheckboxProvider: () => CheckboxProvider,
    unstable_CheckboxTrigger: () => CheckboxTrigger,
    unstable_Provider: () => CheckboxProvider,
    unstable_Trigger: () => CheckboxTrigger
  });
  init_define_import_meta_env();
  var React31 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-use-size@1.1.4_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-size/dist/index.mjs
  init_define_import_meta_env();
  var React30 = __toESM(require_react_shim(), 1);
  var __defProp19 = Object.defineProperty;
  var __name18 = (target, value) => __defProp19(target, "name", { value, configurable: true });
  function useSize(element) {
    const [size4, setSize] = React30.useState(void 0);
    useLayoutEffect2(() => {
      if (element) {
        setSize({ width: element.offsetWidth, height: element.offsetHeight });
        const resizeObserver = new ResizeObserver((entries) => {
          if (!Array.isArray(entries)) {
            return;
          }
          if (!entries.length) {
            return;
          }
          const entry = entries[0];
          let width;
          let height;
          if ("borderBoxSize" in entry) {
            const borderSizeEntry = entry["borderBoxSize"];
            const borderSize = Array.isArray(borderSizeEntry) ? borderSizeEntry[0] : borderSizeEntry;
            width = borderSize["inlineSize"];
            height = borderSize["blockSize"];
          } else {
            width = element.offsetWidth;
            height = element.offsetHeight;
          }
          setSize({ width, height });
        });
        resizeObserver.observe(element, { box: "border-box" });
        return () => resizeObserver.unobserve(element);
      } else {
        setSize(void 0);
      }
    }, [element]);
    return size4;
  }
  __name18(useSize, "useSize");

  // node_modules/.pnpm/@radix-ui+react-checkbox@1.3.11_@types+react-dom@19.2.3_@types+react@19.2.17__@types+re_f6e0f4835f2e28dbd2e5cb3844d005eb/node_modules/@radix-ui/react-checkbox/dist/index.mjs
  var import_jsx_runtime11 = __toESM(require_react_shim(), 1);
  var __defProp20 = Object.defineProperty;
  var __name19 = (target, value) => __defProp20(target, "name", { value, configurable: true });
  var CHECKBOX_NAME = "Checkbox";
  var [createCheckboxContext, createCheckboxScope] = createContextScope(CHECKBOX_NAME);
  var [CheckboxProviderImpl, useCheckboxContext] = createCheckboxContext(CHECKBOX_NAME);
  function CheckboxProvider(props) {
    const {
      __scopeCheckbox,
      checked: checkedProp,
      children,
      defaultChecked,
      disabled,
      form,
      name,
      onCheckedChange,
      required,
      value = "on",
      // @ts-expect-error
      internal_do_not_use_render
    } = props;
    const [checked, setChecked] = useControllableState({
      prop: checkedProp,
      defaultProp: defaultChecked ?? false,
      onChange: onCheckedChange,
      caller: CHECKBOX_NAME
    });
    const [control, setControl] = React31.useState(null);
    const [bubbleInput, setBubbleInput] = React31.useState(null);
    const hasConsumerStoppedPropagationRef = React31.useRef(false);
    const [userInteractionCount, onUserInteraction] = React31.useReducer(
      (count3) => count3 + 1,
      0
    );
    const isFormControl = control ? !!form || !!control.closest("form") : (
      // We set this to true by default so that events bubble to forms without JS (SSR)
      true
    );
    const context = {
      checked,
      disabled,
      setChecked,
      control,
      setControl,
      name,
      form,
      value,
      hasConsumerStoppedPropagationRef,
      userInteractionCount,
      onUserInteraction,
      required,
      defaultChecked: isIndeterminate(defaultChecked) ? false : defaultChecked,
      isFormControl,
      bubbleInput,
      setBubbleInput
    };
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      CheckboxProviderImpl,
      {
        scope: __scopeCheckbox,
        ...context,
        children: isFunction2(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    );
  }
  __name19(CheckboxProvider, "CheckboxProvider");
  var TRIGGER_NAME2 = "CheckboxTrigger";
  var CheckboxTrigger = /* @__PURE__ */ React31.forwardRef(
    /* @__PURE__ */ __name19(function CheckboxTrigger2({ __scopeCheckbox, onKeyDown, onClick, ...checkboxProps }, forwardedRef) {
      const {
        control,
        value,
        disabled,
        checked,
        required,
        setControl,
        setChecked,
        hasConsumerStoppedPropagationRef,
        onUserInteraction,
        isFormControl,
        bubbleInput
      } = useCheckboxContext(TRIGGER_NAME2, __scopeCheckbox);
      const composedRefs = useComposedRefs(forwardedRef, setControl);
      const initialCheckedStateRef = React31.useRef(checked);
      React31.useEffect(() => {
        const form = control?.form;
        if (form) {
          const reset = /* @__PURE__ */ __name19(() => setChecked(initialCheckedStateRef.current), "reset");
          form.addEventListener("reset", reset);
          return () => form.removeEventListener("reset", reset);
        }
      }, [control, setChecked]);
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        Primitive.button,
        {
          type: "button",
          role: "checkbox",
          "aria-checked": isIndeterminate(checked) ? "mixed" : checked,
          "aria-required": required,
          "data-state": getState2(checked),
          "data-disabled": disabled ? "" : void 0,
          disabled,
          value,
          ...checkboxProps,
          ref: composedRefs,
          onKeyDown: composeEventHandlers(onKeyDown, (event) => {
            if (event.key === "Enter") event.preventDefault();
          }),
          onClick: composeEventHandlers(onClick, (event) => {
            onUserInteraction();
            setChecked((prevChecked) => isIndeterminate(prevChecked) ? true : !prevChecked);
            if (bubbleInput && isFormControl) {
              hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
              if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
          })
        }
      );
    }, "CheckboxTrigger")
  );
  var Checkbox = /* @__PURE__ */ React31.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function Checkbox2(props, forwardedRef) {
      const {
        __scopeCheckbox,
        name,
        checked,
        defaultChecked,
        required,
        disabled,
        value,
        onCheckedChange,
        form,
        ...checkboxProps
      } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        CheckboxProvider,
        {
          __scopeCheckbox,
          checked,
          defaultChecked,
          disabled,
          required,
          onCheckedChange,
          name,
          form,
          value,
          internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              CheckboxTrigger,
              {
                ...checkboxProps,
                ref: forwardedRef,
                __scopeCheckbox
              }
            ),
            isFormControl && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              CheckboxBubbleInput,
              {
                __scopeCheckbox
              }
            )
          ] })
        }
      );
    }, "Checkbox")
  );
  var INDICATOR_NAME = "CheckboxIndicator";
  var CheckboxIndicator = /* @__PURE__ */ React31.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function CheckboxIndicator2(props, forwardedRef) {
      const { __scopeCheckbox, forceMount, ...indicatorProps } = props;
      const context = useCheckboxContext(INDICATOR_NAME, __scopeCheckbox);
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        Presence,
        {
          present: forceMount || isIndeterminate(context.checked) || context.checked === true,
          children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            Primitive.span,
            {
              "data-state": getState2(context.checked),
              "data-disabled": context.disabled ? "" : void 0,
              ...indicatorProps,
              ref: forwardedRef,
              style: { pointerEvents: "none", ...props.style }
            }
          )
        }
      );
    }, "CheckboxIndicator")
  );
  var BUBBLE_INPUT_NAME = "CheckboxBubbleInput";
  var CheckboxBubbleInput = /* @__PURE__ */ React31.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function CheckboxBubbleInput2({ __scopeCheckbox, onClick, ...props }, forwardedRef) {
      const {
        control,
        hasConsumerStoppedPropagationRef,
        userInteractionCount,
        checked,
        defaultChecked,
        required,
        disabled,
        name,
        value,
        form,
        bubbleInput,
        setBubbleInput
      } = useCheckboxContext(BUBBLE_INPUT_NAME, __scopeCheckbox);
      const composedRefs = useComposedRefs(forwardedRef, setBubbleInput);
      const controlSize = useSize(control);
      const shouldStopClickPropagationRef = React31.useRef(false);
      const prevCheckedRef = React31.useRef(checked);
      const prevUserInteractionCountRef = React31.useRef(userInteractionCount);
      React31.useEffect(() => {
        const input = bubbleInput;
        if (!input) return;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          inputProto,
          "checked"
        );
        const setChecked = descriptor.set;
        const isUserInteraction = userInteractionCount !== prevUserInteractionCountRef.current;
        prevUserInteractionCountRef.current = userInteractionCount;
        const checkedChanged = prevCheckedRef.current !== checked;
        prevCheckedRef.current = checked;
        const bubbles = !(isUserInteraction && hasConsumerStoppedPropagationRef.current);
        if (checkedChanged && setChecked) {
          shouldStopClickPropagationRef.current = !isUserInteraction;
          const event = new Event("click", { bubbles });
          input.indeterminate = isIndeterminate(checked);
          setChecked.call(input, isIndeterminate(checked) ? false : checked);
          input.dispatchEvent(event);
          shouldStopClickPropagationRef.current = false;
        }
      }, [bubbleInput, checked, hasConsumerStoppedPropagationRef, userInteractionCount]);
      const defaultCheckedRef = React31.useRef(isIndeterminate(checked) ? false : checked);
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        Primitive.input,
        {
          type: "checkbox",
          "aria-hidden": true,
          defaultChecked: defaultChecked ?? defaultCheckedRef.current,
          required,
          disabled,
          name,
          value,
          form,
          ...props,
          tabIndex: -1,
          ref: composedRefs,
          onClick: composeEventHandlers(onClick, (event) => {
            if (shouldStopClickPropagationRef.current) {
              event.stopPropagation();
            }
          }),
          style: {
            ...props.style,
            ...controlSize,
            position: "absolute",
            pointerEvents: "none",
            opacity: 0,
            margin: 0,
            // We transform because the input is absolutely positioned but we have
            // rendered it **after** the button. This pulls it back to sit on top
            // of the button.
            transform: "translateX(-100%)"
          }
        }
      );
    }, "CheckboxBubbleInput")
  );
  function isFunction2(value) {
    return typeof value === "function";
  }
  __name19(isFunction2, "isFunction");
  function isIndeterminate(checked) {
    return checked === "indeterminate";
  }
  __name19(isIndeterminate, "isIndeterminate");
  function getState2(checked) {
    return isIndeterminate(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }
  __name19(getState2, "getState");

  // node_modules/.pnpm/@radix-ui+react-menu@2.1.24_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react@_b4abbb2a563651316651d75e08bb1ff0/node_modules/@radix-ui/react-menu/dist/index.mjs
  init_define_import_meta_env();
  var React37 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-popper@1.3.7_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react_4e5bda27561956783247cbf95bf4739f/node_modules/@radix-ui/react-popper/dist/index.mjs
  init_define_import_meta_env();
  var React34 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@floating-ui+react-dom@2.1.9_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/@floating-ui+dom@1.8.0/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/@floating-ui+core@1.8.0/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  init_define_import_meta_env();
  var sides = ["top", "right", "bottom", "left"];
  var min = Math.min;
  var max = Math.max;
  var round = Math.round;
  var floor = Math.floor;
  var createCoords = (v) => ({
    x: v,
    y: v
  });
  var oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value === "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    const firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    if (rtl === void 0) {
      rtl = false;
    }
    const alignment = getAlignment(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const length = getAxisLength(alignmentAxis);
    let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    if (rects.reference[length] > rects.floating[length]) {
      mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
    }
    return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    const oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"];
  var rlPlacement = ["right", "left"];
  var tbPlacement = ["top", "bottom"];
  var btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        if (rtl) return isStart ? rlPlacement : lrPlacement;
        return isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    const alignment = getAlignment(placement);
    let list = getSideList(getSide(placement), direction === "start", rtl);
    if (alignment) {
      list = list.map((side) => side + "-" + alignment);
      if (flipAlignment) {
        list = list.concat(list.map(getOppositeAlignmentPlacement));
      }
    }
    return list;
  }
  function getOppositePlacement(placement) {
    const side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    var _padding$top, _padding$right, _padding$bottom, _padding$left;
    return {
      top: (_padding$top = padding.top) != null ? _padding$top : 0,
      right: (_padding$right = padding.right) != null ? _padding$right : 0,
      bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
      left: (_padding$left = padding.left) != null ? _padding$left : 0
    };
  }
  function getPaddingObject(padding) {
    return typeof padding !== "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    const {
      x,
      y,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      x,
      y
    };
  }

  // node_modules/.pnpm/@floating-ui+core@1.8.0/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref;
    const sideAxis = getSideAxis(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const alignLength = getAxisLength(alignmentAxis);
    const side = getSide(placement);
    const isVertical = sideAxis === "y";
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    const alignment = getAlignment(placement);
    if (alignment) {
      coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
    }
    return coords;
  }
  async function detectOverflow(state, options2) {
    var _await$platform$isEle;
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      x,
      y,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state;
    const {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = false,
      padding = 0
    } = evaluate(options2, state);
    const paddingObject = getPaddingObject(padding);
    const altContext = elementContext === "floating" ? "reference" : "floating";
    const element = elements[altBoundary ? altContext : elementContext];
    const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    }));
    const rect = elementContext === "floating" ? {
      x,
      y,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference;
    const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) && await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    };
    const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50;
  var computePosition = async (reference, floating, config) => {
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config;
    const platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    };
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
    let rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    });
    let {
      x,
      y
    } = computeCoordsFromPlacement(rects, placement, rtl);
    let statefulPlacement = placement;
    let resetCount = 0;
    const middlewareData = {};
    for (let i = 0; i < middleware.length; i++) {
      const currentMiddleware = middleware[i];
      if (!currentMiddleware) {
        continue;
      }
      const {
        name,
        fn
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
        x,
        y,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x = nextX != null ? nextX : x;
      y = nextY != null ? nextY : y;
      middlewareData[name] = {
        ...middlewareData[name],
        ...data
      };
      if (reset && resetCount < MAX_RESET_COUNT) {
        resetCount++;
        if (typeof reset === "object") {
          if (reset.placement) {
            statefulPlacement = reset.placement;
          }
          if (reset.rects) {
            rects = reset.rects === true ? await platform2.getElementRects({
              reference,
              floating,
              strategy
            }) : reset.rects;
          }
          ({
            x,
            y
          } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
        }
        i = -1;
      }
    }
    return {
      x,
      y,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var arrow = (options2) => ({
    name: "arrow",
    options: options2,
    async fn(state) {
      const {
        x,
        y,
        placement,
        rects,
        platform: platform2,
        elements,
        middlewareData
      } = state;
      const {
        element,
        padding = 0
      } = evaluate(options2, state) || {};
      if (element == null) {
        return {};
      }
      const paddingObject = getPaddingObject(padding);
      const coords = {
        x,
        y
      };
      const axis = getAlignmentAxis(placement);
      const length = getAxisLength(axis);
      const arrowDimensions = await platform2.getDimensions(element);
      const isYAxis = axis === "y";
      const minProp = isYAxis ? "top" : "left";
      const maxProp = isYAxis ? "bottom" : "right";
      const clientProp = isYAxis ? "clientHeight" : "clientWidth";
      const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
      const startDiff = coords[axis] - rects.reference[axis];
      const arrowOffsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(element));
      let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
      if (!clientSize || !await (platform2.isElement == null ? void 0 : platform2.isElement(arrowOffsetParent))) {
        clientSize = elements.floating[clientProp] || rects.floating[length];
      }
      const centerToReference = endDiff / 2 - startDiff / 2;
      const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
      const minPadding = min(paddingObject[minProp], largestPossiblePadding);
      const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
      const max3 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset4 = clamp(minPadding, center, max3);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset4 && rects.reference[length] / 2 - (center < minPadding ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < minPadding ? center - minPadding : center - max3 : 0;
      return {
        [axis]: coords[axis] + alignmentOffset,
        data: {
          [axis]: offset4,
          centerOffset: center - offset4 - alignmentOffset,
          ...shouldAddOffset && {
            alignmentOffset
          }
        },
        reset: shouldAddOffset
      };
    }
  });
  var flip = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "flip",
      options: options2,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        const {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = true,
          ...detectOverflowOptions
        } = evaluate(options2, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        const side = getSide(placement);
        const initialSideAxis = getSideAxis(initialPlacement);
        const isBasePlacement = getSide(initialPlacement) === initialPlacement;
        const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
        const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
        const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
          fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        }
        const placements2 = [initialPlacement, ...fallbackPlacements];
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const overflows = [];
        let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis) {
          overflows.push(overflow[side]);
        }
        if (checkCrossAxis) {
          const sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        overflowsData = [...overflowsData, {
          placement,
          overflows
        }];
        if (!overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
          const nextPlacement = placements2[nextIndex];
          if (nextPlacement) {
            const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
            if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
            // overflows the main axis.
            overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
              return {
                data: {
                  index: nextIndex,
                  overflows: overflowsData
                },
                reset: {
                  placement: nextPlacement
                }
              };
            }
          }
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement) {
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return true;
                }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement2) {
                  resetPlacement = placement2;
                }
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          }
          if (placement !== resetPlacement) {
            return {
              reset: {
                placement: resetPlacement
              }
            };
          }
        }
        return {};
      }
    };
  };
  function getSideOffsets(overflow, rect) {
    return {
      top: overflow.top - rect.height,
      right: overflow.right - rect.width,
      bottom: overflow.bottom - rect.height,
      left: overflow.left - rect.width
    };
  }
  function isAnySideFullyClipped(overflow) {
    return sides.some((side) => overflow[side] >= 0);
  }
  var hide = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "hide",
      options: options2,
      async fn(state) {
        const {
          rects,
          platform: platform2
        } = state;
        const {
          strategy = "referenceHidden",
          ...detectOverflowOptions
        } = evaluate(options2, state);
        switch (strategy) {
          case "referenceHidden": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              elementContext: "reference"
            });
            const offsets = getSideOffsets(overflow, rects.reference);
            return {
              data: {
                referenceHiddenOffsets: offsets,
                referenceHidden: isAnySideFullyClipped(offsets)
              }
            };
          }
          case "escaped": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              altBoundary: true
            });
            const offsets = getSideOffsets(overflow, rects.floating);
            return {
              data: {
                escapedOffsets: offsets,
                escaped: isAnySideFullyClipped(offsets)
              }
            };
          }
          default: {
            return {};
          }
        }
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options2) {
    const {
      placement,
      platform: platform2,
      elements
    } = state;
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const isVertical = getSideAxis(placement) === "y";
    const mainAxisMulti = originSides.has(side) ? -1 : 1;
    const crossAxisMulti = rtl && isVertical ? -1 : 1;
    const rawValue = evaluate(options2, state);
    let {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue === "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    if (alignment && typeof alignmentAxis === "number") {
      crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
    }
    return isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options2) {
    if (options2 === void 0) {
      options2 = 0;
    }
    return {
      name: "offset",
      options: options2,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        const {
          x,
          y,
          placement,
          middlewareData
        } = state;
        const diffCoords = await convertValueToCoords(state, options2);
        if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        return {
          x: x + diffCoords.x,
          y: y + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  };
  var shift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "shift",
      options: options2,
      async fn(state) {
        const {
          x,
          y,
          placement,
          platform: platform2
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = false,
          limiter = {
            fn: (_ref) => {
              let {
                x: x2,
                y: y2
              } = _ref;
              return {
                x: x2,
                y: y2
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
        if (checkMainAxis) {
          mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
        }
        if (checkCrossAxis) {
          crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
        }
        const limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x,
            y: limitedCoords.y - y,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };
  var limitShift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      options: options2,
      fn(state) {
        var _rawOffset$mainAxis, _rawOffset$crossAxis;
        const {
          x,
          y,
          placement,
          rects,
          middlewareData
        } = state;
        const {
          offset: offset4 = 0,
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const rawOffset = evaluate(offset4, state);
        const computedOffset = typeof rawOffset === "number" ? {
          mainAxis: rawOffset,
          crossAxis: 0
        } : {
          mainAxis: (_rawOffset$mainAxis = rawOffset.mainAxis) != null ? _rawOffset$mainAxis : 0,
          crossAxis: (_rawOffset$crossAxis = rawOffset.crossAxis) != null ? _rawOffset$crossAxis : 0
        };
        if (checkMainAxis) {
          const len = mainAxis === "y" ? "height" : "width";
          const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
          const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
          if (mainAxisCoord < limitMin) {
            mainAxisCoord = limitMin;
          } else if (mainAxisCoord > limitMax) {
            mainAxisCoord = limitMax;
          }
        }
        if (checkCrossAxis) {
          var _middlewareData$offse, _middlewareData$offse2;
          const len = mainAxis === "y" ? "width" : "height";
          const isOriginSide = originSides.has(getSide(placement));
          const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
          const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
          if (crossAxisCoord < limitMin) {
            crossAxisCoord = limitMin;
          } else if (crossAxisCoord > limitMax) {
            crossAxisCoord = limitMax;
          }
        }
        return {
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        };
      }
    };
  };
  var size = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "size",
      options: options2,
      async fn(state) {
        const {
          placement,
          rects,
          platform: platform2,
          elements
        } = state;
        const {
          apply = () => {
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const side = getSide(placement);
        const alignment = getAlignment(placement);
        const isYAxis = getSideAxis(placement) === "y";
        const {
          width,
          height
        } = rects.floating;
        let heightSide;
        let widthSide;
        if (side === "top" || side === "bottom") {
          heightSide = side;
          widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
        } else {
          widthSide = side;
          heightSide = alignment === "end" ? "top" : "bottom";
        }
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        const maximumClippingWidth = width - overflow.left - overflow.right;
        const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
        const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
        const shiftData = state.middlewareData.shift;
        const noShift = !shiftData;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if (shiftData != null && shiftData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if (shiftData != null && shiftData.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          if (isYAxis) {
            availableWidth = width - 2 * max(overflow.left, overflow.right);
          } else {
            availableHeight = height - 2 * max(overflow.top, overflow.bottom);
          }
        }
        await apply({
          ...state,
          availableWidth,
          availableHeight
        });
        const nextDimensions = await platform2.getDimensions(elements.floating);
        if (width !== nextDimensions.width || height !== nextDimensions.height) {
          return {
            reset: {
              rects: true
            }
          };
        }
        return {};
      }
    };
  };

  // node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  init_define_import_meta_env();
  function hasWindow() {
    return typeof window !== "undefined";
  }
  function getNodeName(node) {
    if (isNode(node)) {
      return (node.nodeName || "").toLowerCase();
    }
    return "#document";
  }
  function getWindow(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement(node) {
    var _ref;
    return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Node || value instanceof getWindow(value).Node;
  }
  function isElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Element || value instanceof getWindow(value).Element;
  }
  function isHTMLElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
  }
  function isShadowRoot(value) {
    if (!hasWindow() || typeof ShadowRoot === "undefined") {
      return false;
    }
    return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
  }
  function isOverflowElement(element) {
    const {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle2(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open")) {
        return true;
      }
    } catch (_e) {
    }
    try {
      return element.matches(":modal");
    } catch (_e) {
      return false;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
  var containRe = /paint|layout|strict|content/;
  var isNotNone = (value) => !!value && value !== "none";
  var isWebKitValue;
  function isContainingBlock(elementOrCss) {
    const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode(element);
    while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
      if (isContainingBlock(currentNode)) {
        return currentNode;
      } else if (isTopLayer(currentNode)) {
        return null;
      }
      currentNode = getParentNode(currentNode);
    }
    return null;
  }
  function isWebKit() {
    if (isWebKitValue == null) {
      isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
    }
    return isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName(node));
  }
  function getComputedStyle2(element) {
    return getWindow(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    if (isElement(element)) {
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop
      };
    }
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html") {
      return node;
    }
    const result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot(node) && node.host || // Fallback.
      getDocumentElement(node)
    );
    return isShadowRoot(result) ? result.host : result;
  }
  function getNearestOverflowAncestor(node) {
    const parentNode = getParentNode(node);
    if (isLastTraversableNode(parentNode)) {
      return (node.ownerDocument || node).body;
    }
    if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
      return parentNode;
    }
    return getNearestOverflowAncestor(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    if (list === void 0) {
      list = [];
    }
    if (traverseIframes === void 0) {
      traverseIframes = true;
    }
    const scrollableAncestor = getNearestOverflowAncestor(node);
    const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
    const win = getWindow(scrollableAncestor);
    if (isBody) {
      const frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else {
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
    }
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // node_modules/.pnpm/@floating-ui+dom@1.8.0/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    const css = getComputedStyle2(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const hasOffset = isHTMLElement(element);
    const offsetWidth = hasOffset ? element.offsetWidth : width;
    const offsetHeight = hasOffset ? element.offsetHeight : height;
    const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    if (shouldFallback) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return !isElement(element) ? element.contextElement : element;
  }
  function getScale(element) {
    const domElement = unwrapElement(element);
    if (!isHTMLElement(domElement)) {
      return createCoords(1);
    }
    const rect = domElement.getBoundingClientRect();
    const {
      width,
      height,
      $
    } = getCssDimensions(domElement);
    let x = ($ ? round(rect.width) : rect.width) / width;
    let y = ($ ? round(rect.height) : rect.height) / height;
    if (!x || !Number.isFinite(x)) {
      x = 1;
    }
    if (!y || !Number.isFinite(y)) {
      y = 1;
    }
    return {
      x,
      y
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    const win = getWindow(element);
    if (!isWebKit() || !win.visualViewport) {
      return noOffsets;
    }
    return {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    if (isFixed === void 0) {
      isFixed = false;
    }
    return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    if (includeScale === void 0) {
      includeScale = false;
    }
    if (isFixedStrategy === void 0) {
      isFixedStrategy = false;
    }
    const clientRect = element.getBoundingClientRect();
    const domElement = unwrapElement(element);
    let scale = createCoords(1);
    if (includeScale) {
      if (offsetParent) {
        if (isElement(offsetParent)) {
          scale = getScale(offsetParent);
        }
      } else {
        scale = getScale(element);
      }
    }
    const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
    let x = (clientRect.left + visualOffsets.x) / scale.x;
    let y = (clientRect.top + visualOffsets.y) / scale.y;
    let width = clientRect.width / scale.x;
    let height = clientRect.height / scale.y;
    if (domElement && offsetParent) {
      const win = getWindow(domElement);
      const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetWin !== currentWin) {
        const iframeScale = getScale(currentIFrame);
        const iframeRect = currentIFrame.getBoundingClientRect();
        const css = getComputedStyle2(currentIFrame);
        const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
        const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x *= iframeScale.x;
        y *= iframeScale.y;
        width *= iframeScale.x;
        height *= iframeScale.y;
        x += left;
        y += top;
        currentWin = getWindow(currentIFrame);
        currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x,
      y
    });
  }
  function getWindowScrollBarX(element, rect) {
    const leftScroll = getNodeScroll(element).scrollLeft;
    if (!rect) {
      return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
    }
    return rect.left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    const htmlRect = documentElement.getBoundingClientRect();
    const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
    const y = htmlRect.top + scroll.scrollTop;
    return {
      x,
      y
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref;
    const isFixed = strategy === "fixed";
    const documentElement = getDocumentElement(offsetParent);
    const topLayer = elements ? isTopLayer(elements.floating) : false;
    if (offsetParent === documentElement || topLayer && isFixed) {
      return rect;
    }
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    let scale = createCoords(1);
    const offsets = createCoords(0);
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    if (isOffsetParentAnElement || !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent);
        scale = getScale(offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return element.getClientRects ? Array.from(element.getClientRects()) : [];
  }
  function getDocumentRect(html) {
    const scroll = getNodeScroll(html);
    const body = html.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x = -scroll.scrollLeft + getWindowScrollBarX(html);
    const y = -scroll.scrollTop;
    if (getComputedStyle2(body).direction === "rtl") {
      x += max(html.clientWidth, body.clientWidth) - width;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy, rootBoundary) {
    if (rootBoundary === void 0) {
      rootBoundary = "viewport";
    }
    const isLayoutViewport = rootBoundary === "layoutViewport";
    const win = getWindow(element);
    const html = getDocumentElement(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x = 0;
    let y = 0;
    if (visualViewport) {
      const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
      if (isLayoutViewport) {
        if (!layoutRelativeClientCoords) {
          x = -visualViewport.offsetLeft;
          y = -visualViewport.offsetTop;
        }
      } else {
        width = visualViewport.width;
        height = visualViewport.height;
        if (layoutRelativeClientCoords) {
          x = visualViewport.offsetLeft;
          y = visualViewport.offsetTop;
        }
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
      if (gutter <= SCROLLBAR_MAX) {
        width -= gutter;
      }
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
    const top = clientRect.top + element.clientTop;
    const left = clientRect.left + element.clientLeft;
    const scale = getScale(element);
    const width = element.clientWidth * scale.x;
    const height = element.clientHeight * scale.y;
    const x = left * scale.x;
    const y = top * scale.y;
    return {
      width,
      height,
      x,
      y
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") {
      rect = getViewportRect(element, strategy, clippingAncestor);
    } else if (clippingAncestor === "document") {
      rect = getDocumentRect(getDocumentElement(element));
    } else if (isElement(clippingAncestor)) {
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    } else {
      const visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
    let lastKeptComputedStyle = null;
    const elementIsFixed = getComputedStyle2(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode(element) : element;
    while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle2(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
      const shouldDropCurrentNode = !currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static");
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        lastKeptComputedStyle = computedStyle;
      }
      currentNode = getParentNode(currentNode);
    }
    cache.set(element, result);
    return result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref;
    const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
    const clippingAncestors = [...elementClippingAncestors, rootBoundary];
    const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;
    let left = firstRect.left;
    for (let i = 1; i < clippingAncestors.length; i++) {
      const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
      top = max(rect.top, top);
      right = min(rect.right, right);
      bottom = min(rect.bottom, bottom);
      left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    const {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    const documentElement = getDocumentElement(offsetParent);
    const isFixed = strategy === "fixed";
    const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    const offsets = createCoords(0);
    if (isOffsetParentAnElement || !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    if (!isOffsetParentAnElement && documentElement) {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
    const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle2(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
      return null;
    }
    if (polyfill) {
      return polyfill(element);
    }
    let rawOffsetParent = element.offsetParent;
    if (getDocumentElement(element) === rawOffsetParent) {
      rawOffsetParent = rawOffsetParent.ownerDocument.body;
    }
    return rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    const win = getWindow(element);
    if (isTopLayer(element)) {
      return win;
    }
    if (!isHTMLElement(element)) {
      let svgOffsetParent = getParentNode(element);
      while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
        if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
          return svgOffsetParent;
        }
        svgOffsetParent = getParentNode(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    }
    if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
      return win;
    }
    return offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
    const getDimensionsFn = this.getDimensions;
    const floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle2(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement,
    isRTL
  };
  function rectsAreEqual(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  function observeMove(element, onMove, ancestorResize) {
    let io = null;
    let timeoutId;
    const root = getDocumentElement(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId);
      (_io = io) == null || _io.disconnect();
      io = null;
    }
    function refresh(skip, threshold) {
      if (skip === void 0) {
        skip = false;
      }
      if (threshold === void 0) {
        threshold = 1;
      }
      cleanup();
      const elementRectForRootMargin = element.getBoundingClientRect();
      const {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (!skip) {
        onMove();
      }
      if (!width || !height) {
        return;
      }
      const insetTop = floor(top);
      const insetRight = floor(root.clientWidth - (left + width));
      const insetBottom = floor(root.clientHeight - (top + height));
      const insetLeft = floor(left);
      const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
      const options2 = {
        rootMargin,
        threshold: max(0, min(1, threshold)) || 1
      };
      let isFirstUpdate = true;
      function handleObserve(entries) {
        const ratio = entries[0].intersectionRatio;
        if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          return refresh();
        }
        if (ratio !== threshold) {
          if (!isFirstUpdate) {
            return refresh();
          }
          if (!ratio) {
            timeoutId = setTimeout(() => {
              refresh(false, 1e-7);
            }, 1e3);
          } else {
            refresh(false, ratio);
          }
        }
        isFirstUpdate = false;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options2,
          // Handle <iframe>s
          root: root.ownerDocument
        });
      } catch (_e) {
        io = new IntersectionObserver(handleObserve, options2);
      }
      io.observe(element);
    }
    const win = getWindow(element);
    const handleResize = () => refresh(ancestorResize);
    win.addEventListener("resize", handleResize);
    refresh(true);
    return () => {
      win.removeEventListener("resize", handleResize);
      cleanup();
    };
  }
  function autoUpdate(reference, floating, update, options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      ancestorScroll = true,
      ancestorResize = true,
      elementResize = typeof ResizeObserver === "function",
      layoutShift = typeof IntersectionObserver === "function",
      animationFrame = false
    } = options2;
    const referenceEl = unwrapElement(reference);
    const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update);
      ancestorResize && ancestor.addEventListener("resize", update);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update, ancestorResize) : null;
    let reobserveFrame = -1;
    let resizeObserver = null;
    if (elementResize) {
      resizeObserver = new ResizeObserver((_ref) => {
        let [firstEntry] = _ref;
        if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
          resizeObserver.unobserve(floating);
          cancelAnimationFrame(reobserveFrame);
          reobserveFrame = requestAnimationFrame(() => {
            var _resizeObserver;
            (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
          });
        }
        update();
      });
      if (referenceEl && !animationFrame) {
        resizeObserver.observe(referenceEl);
      }
      if (floating) {
        resizeObserver.observe(floating);
      }
    }
    let frameId;
    let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    if (animationFrame) {
      frameLoop();
    }
    function frameLoop() {
      const nextRefRect = getBoundingClientRect(reference);
      if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
        update();
      }
      prevRefRect = nextRefRect;
      frameId = requestAnimationFrame(frameLoop);
    }
    update();
    return () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update);
        ancestorResize && ancestor.removeEventListener("resize", update);
      });
      cleanupIo == null || cleanupIo();
      (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
      resizeObserver = null;
      if (animationFrame) {
        cancelAnimationFrame(frameId);
      }
    };
  }
  var offset2 = offset;
  var shift2 = shift;
  var flip2 = flip;
  var size2 = size;
  var hide2 = hide;
  var arrow2 = arrow;
  var limitShift2 = limitShift;
  var computePosition2 = (reference, floating, options2) => {
    const cache = /* @__PURE__ */ new Map();
    const mergedOptions = options2 != null ? options2 : {};
    const platformWithCache = {
      ...platform,
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // node_modules/.pnpm/@floating-ui+react-dom@2.1.9_react-dom@19.2.8_react@19.2.8__react@19.2.8/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
  var React32 = __toESM(require_react_shim(), 1);
  var import_react2 = __toESM(require_react_shim(), 1);
  var ReactDOM3 = __toESM(require_react_dom_shim(), 1);
  var isClient = typeof document !== "undefined";
  var noop = function noop2() {
  };
  var index = isClient ? import_react2.useLayoutEffect : noop;
  function deepEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (typeof a !== typeof b) {
      return false;
    }
    if (typeof a === "function" && a.toString() === b.toString()) {
      return true;
    }
    let length;
    let i;
    let keys;
    if (a && b && typeof a === "object") {
      if (Array.isArray(a)) {
        length = a.length;
        if (length !== b.length) return false;
        for (i = length; i-- !== 0; ) {
          if (!deepEqual(a[i], b[i])) {
            return false;
          }
        }
        return true;
      }
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length) {
        return false;
      }
      for (i = length; i-- !== 0; ) {
        if (!{}.hasOwnProperty.call(b, keys[i])) {
          return false;
        }
      }
      for (i = length; i-- !== 0; ) {
        const key = keys[i];
        if (key === "_owner" && a.$$typeof) {
          continue;
        }
        if (!deepEqual(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }
    return a !== a && b !== b;
  }
  function getDPR(element) {
    if (typeof window === "undefined") {
      return 1;
    }
    const win = element.ownerDocument.defaultView || window;
    return win.devicePixelRatio || 1;
  }
  function roundByDPR(element, value) {
    const dpr = getDPR(element);
    return Math.round(value * dpr) / dpr;
  }
  function useLatestRef(value) {
    const ref = React32.useRef(value);
    index(() => {
      ref.current = value;
    });
    return ref;
  }
  function useFloating(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2,
      elements: {
        reference: externalReference,
        floating: externalFloating
      } = {},
      transform = true,
      whileElementsMounted,
      open
    } = options2;
    const [data, setData] = React32.useState({
      x: 0,
      y: 0,
      strategy,
      placement,
      middlewareData: {},
      isPositioned: false
    });
    const [latestMiddleware, setLatestMiddleware] = React32.useState(middleware);
    if (!deepEqual(latestMiddleware, middleware)) {
      setLatestMiddleware(middleware);
    }
    const [_reference, _setReference] = React32.useState(null);
    const [_floating, _setFloating] = React32.useState(null);
    const setReference = React32.useCallback((node) => {
      if (node !== referenceRef.current) {
        referenceRef.current = node;
        _setReference(node);
      }
    }, []);
    const setFloating = React32.useCallback((node) => {
      if (node !== floatingRef.current) {
        floatingRef.current = node;
        _setFloating(node);
      }
    }, []);
    const referenceEl = externalReference || _reference;
    const floatingEl = externalFloating || _floating;
    const referenceRef = React32.useRef(null);
    const floatingRef = React32.useRef(null);
    const dataRef = React32.useRef(data);
    const hasWhileElementsMounted = whileElementsMounted != null;
    const whileElementsMountedRef = useLatestRef(whileElementsMounted);
    const platformRef = useLatestRef(platform2);
    const openRef = useLatestRef(open);
    const update = React32.useCallback(() => {
      if (!referenceRef.current || !floatingRef.current) {
        return;
      }
      const config = {
        placement,
        strategy,
        middleware: latestMiddleware
      };
      if (platformRef.current) {
        config.platform = platformRef.current;
      }
      computePosition2(referenceRef.current, floatingRef.current, config).then((data2) => {
        const fullData = {
          ...data2,
          // The floating element's position may be recomputed while it's closed
          // but still mounted (such as when transitioning out). To ensure
          // `isPositioned` will be `false` initially on the next open, avoid
          // setting it to `true` when `open === false` (must be specified).
          isPositioned: openRef.current !== false
        };
        if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
          dataRef.current = fullData;
          ReactDOM3.flushSync(() => {
            setData(fullData);
          });
        }
      });
    }, [latestMiddleware, placement, strategy, platformRef, openRef]);
    index(() => {
      if (open === false && dataRef.current.isPositioned) {
        dataRef.current.isPositioned = false;
        setData((data2) => ({
          ...data2,
          isPositioned: false
        }));
      }
    }, [open]);
    const isMountedRef = React32.useRef(false);
    index(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);
    index(() => {
      if (referenceEl) referenceRef.current = referenceEl;
      if (floatingEl) floatingRef.current = floatingEl;
      if (referenceEl && floatingEl) {
        if (whileElementsMountedRef.current) {
          return whileElementsMountedRef.current(referenceEl, floatingEl, update);
        }
        update();
      }
    }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);
    const refs = React32.useMemo(() => ({
      reference: referenceRef,
      floating: floatingRef,
      setReference,
      setFloating
    }), [setReference, setFloating]);
    const elements = React32.useMemo(() => ({
      reference: referenceEl,
      floating: floatingEl
    }), [referenceEl, floatingEl]);
    const floatingStyles = React32.useMemo(() => {
      const initialStyles = {
        position: strategy,
        left: 0,
        top: 0
      };
      if (!elements.floating) {
        return initialStyles;
      }
      const x = roundByDPR(elements.floating, data.x);
      const y = roundByDPR(elements.floating, data.y);
      if (transform) {
        return {
          ...initialStyles,
          transform: "translate(" + x + "px, " + y + "px)",
          ...getDPR(elements.floating) >= 1.5 && {
            willChange: "transform"
          }
        };
      }
      return {
        position: strategy,
        left: x,
        top: y
      };
    }, [strategy, transform, elements.floating, data.x, data.y]);
    return React32.useMemo(() => ({
      ...data,
      update,
      refs,
      elements,
      floatingStyles
    }), [data, update, refs, elements, floatingStyles]);
  }
  var arrow$1 = (options2) => {
    function isRef(value) {
      return {}.hasOwnProperty.call(value, "current");
    }
    return {
      name: "arrow",
      options: options2,
      fn(state) {
        const {
          element,
          padding
        } = typeof options2 === "function" ? options2(state) : options2;
        if (element && isRef(element)) {
          if (element.current != null) {
            return arrow2({
              element: element.current,
              padding
            }).fn(state);
          }
          return {};
        }
        if (element) {
          return arrow2({
            element,
            padding
          }).fn(state);
        }
        return {};
      }
    };
  };
  var offset3 = (options2, deps) => {
    const result = offset2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var shift3 = (options2, deps) => {
    const result = shift2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var limitShift3 = (options2, deps) => {
    const result = limitShift2(options2);
    return {
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var flip3 = (options2, deps) => {
    const result = flip2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var size3 = (options2, deps) => {
    const result = size2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var hide3 = (options2, deps) => {
    const result = hide2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var arrow3 = (options2, deps) => {
    const result = arrow$1(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };

  // node_modules/.pnpm/@radix-ui+react-arrow@1.1.15_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react_4d0c091b4d3d78b3d38bb97d37c10718/node_modules/@radix-ui/react-arrow/dist/index.mjs
  init_define_import_meta_env();
  var React33 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime12 = __toESM(require_react_shim(), 1);
  var __defProp21 = Object.defineProperty;
  var __name20 = (target, value) => __defProp21(target, "name", { value, configurable: true });
  var Arrow = /* @__PURE__ */ React33.forwardRef(
    /* @__PURE__ */ __name20(function Arrow2(props, forwardedRef) {
      const { children, width = 10, height = 5, ...arrowProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        Primitive.svg,
        {
          ...arrowProps,
          ref: forwardedRef,
          width,
          height,
          viewBox: "0 0 30 10",
          preserveAspectRatio: "none",
          children: props.asChild ? children : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("polygon", { points: "0,0 30,0 15,10" })
        }
      );
    }, "Arrow")
  );
  var Root = Arrow;

  // node_modules/.pnpm/@radix-ui+react-popper@1.3.7_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react_4e5bda27561956783247cbf95bf4739f/node_modules/@radix-ui/react-popper/dist/index.mjs
  var import_jsx_runtime13 = __toESM(require_react_shim(), 1);
  var __defProp22 = Object.defineProperty;
  var __name21 = (target, value) => __defProp22(target, "name", { value, configurable: true });
  var POPPER_NAME = "Popper";
  var [createPopperContext, createPopperScope] = createContextScope(POPPER_NAME);
  var [PopperProvider, usePopperContext] = createPopperContext(POPPER_NAME);
  var Popper = /* @__PURE__ */ __name21((props) => {
    const { __scopePopper, children } = props;
    const [anchor, setAnchor] = React34.useState(null);
    const [placementState, setPlacementState] = React34.useState(void 0);
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      PopperProvider,
      {
        scope: __scopePopper,
        anchor,
        onAnchorChange: setAnchor,
        placementState,
        setPlacementState,
        children
      }
    );
  }, "Popper");
  var ANCHOR_NAME = "PopperAnchor";
  var PopperAnchor = /* @__PURE__ */ React34.forwardRef(
    /* @__PURE__ */ __name21(function PopperAnchor2(props, forwardedRef) {
      const { __scopePopper, virtualRef, ...anchorProps } = props;
      const context = usePopperContext(ANCHOR_NAME, __scopePopper);
      const ref = React34.useRef(null);
      const onAnchorChange = context.onAnchorChange;
      const callbackRef = React34.useCallback(
        (node) => {
          ref.current = node;
          if (node) {
            onAnchorChange(node);
          }
        },
        [onAnchorChange]
      );
      const composedRefs = useComposedRefs(forwardedRef, callbackRef);
      const anchorRef = React34.useRef(null);
      React34.useEffect(() => {
        if (!virtualRef) {
          return;
        }
        const previousAnchor = anchorRef.current;
        anchorRef.current = virtualRef.current;
        if (previousAnchor !== anchorRef.current) {
          onAnchorChange(anchorRef.current);
        }
      });
      const sideAndAlign = context.placementState && getSideAndAlignFromPlacement(context.placementState);
      const placedSide = sideAndAlign?.[0];
      const placedAlign = sideAndAlign?.[1];
      return virtualRef ? null : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        Primitive.div,
        {
          "data-radix-popper-side": placedSide,
          "data-radix-popper-align": placedAlign,
          ...anchorProps,
          ref: composedRefs
        }
      );
    }, "PopperAnchor")
  );
  var CONTENT_NAME2 = "PopperContent";
  var [PopperContentProvider, useContentContext] = createPopperContext(CONTENT_NAME2);
  var PopperContent = /* @__PURE__ */ React34.forwardRef(
    /* @__PURE__ */ __name21(function PopperContent2(props, forwardedRef) {
      const {
        __scopePopper,
        side = "bottom",
        sideOffset = 0,
        align = "center",
        alignOffset = 0,
        arrowPadding = 0,
        avoidCollisions = true,
        collisionBoundary = [],
        collisionPadding: collisionPaddingProp = 0,
        sticky = "partial",
        hideWhenDetached = false,
        updatePositionStrategy = "optimized",
        onPlaced,
        ...contentProps
      } = props;
      const context = usePopperContext(CONTENT_NAME2, __scopePopper);
      const [content, setContent] = React34.useState(null);
      const composedRefs = useComposedRefs(forwardedRef, setContent);
      const [arrow4, setArrow] = React34.useState(null);
      const arrowSize = useSize(arrow4);
      const arrowWidth = arrowSize?.width ?? 0;
      const arrowHeight = arrowSize?.height ?? 0;
      const desiredPlacement = side + (align !== "center" ? "-" + align : "");
      const collisionPadding = typeof collisionPaddingProp === "number" ? collisionPaddingProp : { top: 0, right: 0, bottom: 0, left: 0, ...collisionPaddingProp };
      const boundary = Array.isArray(collisionBoundary) ? collisionBoundary : [collisionBoundary];
      const hasExplicitBoundaries = boundary.length > 0;
      const detectOverflowOptions = {
        padding: collisionPadding,
        boundary: boundary.filter(isNotNull),
        // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
        altBoundary: hasExplicitBoundaries
      };
      const { refs, floatingStyles, placement, isPositioned, middlewareData } = useFloating({
        // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
        strategy: "fixed",
        placement: desiredPlacement,
        whileElementsMounted: /* @__PURE__ */ __name21((...args) => {
          const cleanup = autoUpdate(...args, {
            animationFrame: updatePositionStrategy === "always"
          });
          return cleanup;
        }, "whileElementsMounted"),
        elements: {
          reference: context.anchor
        },
        middleware: [
          offset3({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
          avoidCollisions && shift3({
            mainAxis: true,
            crossAxis: false,
            limiter: sticky === "partial" ? limitShift3() : void 0,
            ...detectOverflowOptions
          }),
          avoidCollisions && flip3({ ...detectOverflowOptions }),
          size3({
            ...detectOverflowOptions,
            apply: /* @__PURE__ */ __name21(({ elements, rects, availableWidth, availableHeight }) => {
              const { width: anchorWidth, height: anchorHeight } = rects.reference;
              const contentStyle = elements.floating.style;
              contentStyle.setProperty("--radix-popper-available-width", `${availableWidth}px`);
              contentStyle.setProperty("--radix-popper-available-height", `${availableHeight}px`);
              contentStyle.setProperty("--radix-popper-anchor-width", `${anchorWidth}px`);
              contentStyle.setProperty("--radix-popper-anchor-height", `${anchorHeight}px`);
            }, "apply")
          }),
          arrow4 && arrow3({ element: arrow4, padding: arrowPadding }),
          transformOrigin({ arrowWidth, arrowHeight }),
          hideWhenDetached && hide3({
            strategy: "referenceHidden",
            ...detectOverflowOptions,
            // `hide` detects whether the anchor (reference) is clipped, so when
            // no explicit `collisionBoundary` is set we fall back to Floating
            // UI's default clipping ancestors (e.g. a scrollable menu). This
            // lets an occluded submenu hide once its anchor scrolls out of view
            // (#3237). The collision/size middlewares deliberately keep the
            // viewport-based default to avoid clamping content rendered inside
            // transformed or overflow-clipping portal containers.
            boundary: hasExplicitBoundaries ? detectOverflowOptions.boundary : void 0
          })
        ]
      });
      const setPlacementState = context.setPlacementState;
      useLayoutEffect2(() => {
        setPlacementState(placement);
        return () => {
          setPlacementState(void 0);
        };
      }, [placement, setPlacementState]);
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const handlePlaced = useCallbackRef(onPlaced);
      useLayoutEffect2(() => {
        if (isPositioned) {
          handlePlaced?.();
        }
      }, [isPositioned, handlePlaced]);
      const arrowX = middlewareData.arrow?.x;
      const arrowY = middlewareData.arrow?.y;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const [contentZIndex, setContentZIndex] = React34.useState();
      useLayoutEffect2(() => {
        if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
      }, [content]);
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "div",
        {
          ref: refs.setFloating,
          "data-radix-popper-content-wrapper": "",
          style: {
            ...floatingStyles,
            transform: isPositioned ? floatingStyles.transform : "translate(0, -200%)",
            // keep off the page when measuring
            minWidth: "max-content",
            zIndex: contentZIndex,
            "--radix-popper-transform-origin": [
              middlewareData.transformOrigin?.x,
              middlewareData.transformOrigin?.y
            ].join(" "),
            // hide the content if using the hide middleware and should be hidden
            // set visibility to hidden and disable pointer events so the UI behaves
            // as if the PopperContent isn't there at all
            ...middlewareData.hide?.referenceHidden && {
              visibility: "hidden",
              pointerEvents: "none"
            }
          },
          dir: props.dir,
          children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            PopperContentProvider,
            {
              scope: __scopePopper,
              placedSide,
              placedAlign,
              onArrowChange: setArrow,
              arrowX,
              arrowY,
              shouldHideArrow: cannotCenterArrow,
              children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                Primitive.div,
                {
                  "data-side": placedSide,
                  "data-align": placedAlign,
                  ...contentProps,
                  ref: composedRefs,
                  style: {
                    ...contentProps.style,
                    // if the PopperContent hasn't been placed yet (not all
                    // measurements done) we prevent animations so that users'
                    // animations don't kick in too early from the wrong sides.
                    animation: !isPositioned ? "none" : contentProps.style?.animation
                  }
                }
              )
            }
          )
        }
      );
    }, "PopperContent")
  );
  var ARROW_NAME = "PopperArrow";
  var OPPOSITE_SIDE = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right"
  };
  var PopperArrow = /* @__PURE__ */ React34.forwardRef(
    /* @__PURE__ */ __name21(function PopperArrow2(props, forwardedRef) {
      const { __scopePopper, ...arrowProps } = props;
      const contentContext = useContentContext(ARROW_NAME, __scopePopper);
      const baseSide = OPPOSITE_SIDE[contentContext.placedSide];
      return (
        // we have to use an extra wrapper because `ResizeObserver` (used by `useSize`)
        // doesn't report size as we'd expect on SVG elements.
        // it reports their bounding box which is effectively the largest path inside the SVG.
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "span",
          {
            ref: contentContext.onArrowChange,
            style: {
              position: "absolute",
              left: contentContext.arrowX,
              top: contentContext.arrowY,
              [baseSide]: 0,
              transformOrigin: {
                top: "",
                right: "0 0",
                bottom: "center 0",
                left: "100% 0"
              }[contentContext.placedSide],
              transform: {
                top: "translateY(100%)",
                right: "translateY(50%) rotate(90deg) translateX(-50%)",
                bottom: `rotate(180deg)`,
                left: "translateY(50%) rotate(-90deg) translateX(50%)"
              }[contentContext.placedSide],
              visibility: contentContext.shouldHideArrow ? "hidden" : void 0
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              Root,
              {
                ...arrowProps,
                ref: forwardedRef,
                style: {
                  ...arrowProps.style,
                  // ensures the element can be measured correctly (mostly for if SVG)
                  display: "block"
                }
              }
            )
          }
        )
      );
    }, "PopperArrow")
  );
  function isNotNull(value) {
    return value !== null;
  }
  __name21(isNotNull, "isNotNull");
  var transformOrigin = /* @__PURE__ */ __name21((options2) => ({
    name: "transformOrigin",
    options: options2,
    fn(data) {
      const { placement, rects, middlewareData } = data;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options2.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options2.arrowHeight;
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: "0%", center: "50%", end: "100%" }[placedAlign];
      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
      let x = "";
      let y = "";
      if (placedSide === "bottom") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === "top") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === "right") {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === "left") {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    }
  }), "transformOrigin");
  function getSideAndAlignFromPlacement(placement) {
    const [side, align = "center"] = placement.split("-");
    return [side, align];
  }
  __name21(getSideAndAlignFromPlacement, "getSideAndAlignFromPlacement");
  var Root2 = Popper;
  var Anchor = PopperAnchor;
  var Content = PopperContent;
  var Arrow3 = PopperArrow;

  // node_modules/.pnpm/@radix-ui+react-roving-focus@1.1.19_@types+react-dom@19.2.3_@types+react@19.2.17__@type_1ba36d19799ef89b87b035255f196a64/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
  init_define_import_meta_env();
  var React36 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@radix-ui+react-use-is-hydrated@0.1.3_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-is-hydrated/dist/index.mjs
  init_define_import_meta_env();
  var React210 = __toESM(require_react_shim(), 1);
  var React35 = __toESM(require_react_shim(), 1);
  var __defProp23 = Object.defineProperty;
  var __name22 = (target, value) => __defProp23(target, "name", { value, configurable: true });
  var _isHydrated = false;
  function useIsHydrated() {
    const [isHydrated, setIsHydrated] = React35.useState(_isHydrated);
    React35.useEffect(() => {
      if (!_isHydrated) {
        _isHydrated = true;
        setIsHydrated(true);
      }
    }, []);
    return isHydrated;
  }
  __name22(useIsHydrated, "useIsHydrated");
  var useReactSyncExternalStore = React210[" useSyncExternalStore ".trim().toString()];
  function subscribe() {
    return () => {
    };
  }
  __name22(subscribe, "subscribe");
  function useIsHydratedModern() {
    return useReactSyncExternalStore(
      subscribe,
      () => true,
      () => false
    );
  }
  __name22(useIsHydratedModern, "useIsHydratedModern");
  var useIsHydrated2 = typeof useReactSyncExternalStore === "function" ? useIsHydratedModern : useIsHydrated;

  // node_modules/.pnpm/@radix-ui+react-roving-focus@1.1.19_@types+react-dom@19.2.3_@types+react@19.2.17__@type_1ba36d19799ef89b87b035255f196a64/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
  var import_jsx_runtime14 = __toESM(require_react_shim(), 1);
  var __defProp24 = Object.defineProperty;
  var __name23 = (target, value) => __defProp24(target, "name", { value, configurable: true });
  var ENTRY_FOCUS = "rovingFocusGroup.onEntryFocus";
  var EVENT_OPTIONS2 = { bubbles: false, cancelable: true };
  var GROUP_NAME = "RovingFocusGroup";
  var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);
  var [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(
    GROUP_NAME,
    [createCollectionScope]
  );
  var [RovingFocusProvider, useRovingFocusContext] = createRovingFocusGroupContext(GROUP_NAME);
  var RovingFocusGroup = /* @__PURE__ */ React36.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name23(function RovingFocusGroup2(props, forwardedRef) {
      return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Collection.Provider, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Collection.Slot, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(RovingFocusGroupImpl, { ...props, ref: forwardedRef }) }) });
    }, "RovingFocusGroup")
  );
  var RovingFocusGroupImpl = /* @__PURE__ */ React36.forwardRef(/* @__PURE__ */ __name23(function RovingFocusGroupImpl2(props, forwardedRef) {
    const {
      __scopeRovingFocusGroup,
      orientation,
      loop = false,
      dir,
      currentTabStopId: currentTabStopIdProp,
      defaultCurrentTabStopId,
      onCurrentTabStopIdChange,
      onEntryFocus,
      preventScrollOnEntryFocus = false,
      ...groupProps
    } = props;
    const ref = React36.useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const direction = useDirection(dir);
    const [currentTabStopId, setCurrentTabStopId] = useControllableState({
      prop: currentTabStopIdProp,
      defaultProp: defaultCurrentTabStopId ?? null,
      onChange: onCurrentTabStopIdChange,
      caller: GROUP_NAME
    });
    const [isTabbingBackOut, setIsTabbingBackOut] = React36.useState(false);
    const handleEntryFocus = useCallbackRef(onEntryFocus);
    const getItems = useCollection(__scopeRovingFocusGroup);
    const isClickFocusRef = React36.useRef(false);
    const [focusableItemsCount, setFocusableItemsCount] = React36.useState(0);
    React36.useEffect(() => {
      const node = ref.current;
      if (node) {
        node.addEventListener(ENTRY_FOCUS, handleEntryFocus);
        return () => node.removeEventListener(ENTRY_FOCUS, handleEntryFocus);
      }
    }, [handleEntryFocus]);
    return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
      RovingFocusProvider,
      {
        scope: __scopeRovingFocusGroup,
        orientation,
        dir: direction,
        loop,
        currentTabStopId,
        onItemFocus: React36.useCallback(
          (tabStopId) => setCurrentTabStopId(tabStopId),
          [setCurrentTabStopId]
        ),
        onItemShiftTab: React36.useCallback(() => setIsTabbingBackOut(true), []),
        onFocusableItemAdd: React36.useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount + 1),
          []
        ),
        onFocusableItemRemove: React36.useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount - 1),
          []
        ),
        children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          Primitive.div,
          {
            tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
            "data-orientation": orientation,
            ...groupProps,
            ref: composedRefs,
            style: { outline: "none", ...props.style },
            onMouseDown: composeEventHandlers(props.onMouseDown, () => {
              isClickFocusRef.current = true;
            }),
            onFocus: composeEventHandlers(props.onFocus, (event) => {
              const isKeyboardFocus = !isClickFocusRef.current;
              if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
                const entryFocusEvent = new CustomEvent(ENTRY_FOCUS, EVENT_OPTIONS2);
                event.currentTarget.dispatchEvent(entryFocusEvent);
                if (!entryFocusEvent.defaultPrevented) {
                  const items = getItems().filter((item) => item.focusable);
                  const activeItem = items.find((item) => item.active);
                  const currentItem = items.find((item) => item.id === currentTabStopId);
                  const candidateItems = [activeItem, currentItem, ...items].filter(
                    Boolean
                  );
                  const candidateNodes = candidateItems.map((item) => item.ref.current);
                  focusFirst2(candidateNodes, preventScrollOnEntryFocus);
                }
              }
              isClickFocusRef.current = false;
            }),
            onBlur: composeEventHandlers(props.onBlur, () => setIsTabbingBackOut(false))
          }
        )
      }
    );
  }, "RovingFocusGroupImpl"));
  var ITEM_NAME = "RovingFocusGroupItem";
  var RovingFocusGroupItem = /* @__PURE__ */ React36.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name23(function RovingFocusGroupItem2(props, forwardedRef) {
      const {
        __scopeRovingFocusGroup,
        focusable = true,
        active = false,
        tabStopId,
        children,
        ...itemProps
      } = props;
      const autoId = useId();
      const id = tabStopId || autoId;
      const context = useRovingFocusContext(ITEM_NAME, __scopeRovingFocusGroup);
      const isCurrentTabStop = context.currentTabStopId === id;
      const getItems = useCollection(__scopeRovingFocusGroup);
      const { onFocusableItemAdd, onFocusableItemRemove, currentTabStopId } = context;
      const isHydrated = useIsHydrated2();
      useLayoutEffect2(() => {
        if (!isHydrated || !focusable) {
          return;
        }
        onFocusableItemAdd();
        return () => onFocusableItemRemove();
      }, [isHydrated, focusable, onFocusableItemAdd, onFocusableItemRemove]);
      React36.useEffect(() => {
        if (isHydrated || !focusable) {
          return;
        }
        onFocusableItemAdd();
        return () => onFocusableItemRemove();
      }, [isHydrated, focusable, onFocusableItemAdd, onFocusableItemRemove]);
      return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        Collection.ItemSlot,
        {
          scope: __scopeRovingFocusGroup,
          id,
          focusable,
          active,
          children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
            Primitive.span,
            {
              tabIndex: isCurrentTabStop ? 0 : -1,
              "data-orientation": context.orientation,
              ...itemProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!focusable) event.preventDefault();
                else context.onItemFocus(id);
              }),
              onFocus: composeEventHandlers(props.onFocus, () => context.onItemFocus(id)),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if (event.key === "Tab" && event.shiftKey) {
                  context.onItemShiftTab();
                  return;
                }
                if (event.target !== event.currentTarget) return;
                const focusIntent = getFocusIntent(event, context.orientation, context.dir);
                if (focusIntent !== void 0) {
                  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                  event.preventDefault();
                  const items = getItems().filter((item) => item.focusable);
                  let candidateNodes = items.map((item) => item.ref.current);
                  if (focusIntent === "last") candidateNodes.reverse();
                  else if (focusIntent === "prev" || focusIntent === "next") {
                    if (focusIntent === "prev") candidateNodes.reverse();
                    const currentIndex = candidateNodes.indexOf(event.currentTarget);
                    candidateNodes = context.loop ? wrapArray(candidateNodes, currentIndex + 1) : candidateNodes.slice(currentIndex + 1);
                  }
                  setTimeout(() => focusFirst2(candidateNodes));
                }
              }),
              children: typeof children === "function" ? children({ isCurrentTabStop, hasTabStop: currentTabStopId != null }) : children
            }
          )
        }
      );
    }, "RovingFocusGroupItem")
  );
  var MAP_KEY_TO_FOCUS_INTENT = {
    ArrowLeft: "prev",
    ArrowUp: "prev",
    ArrowRight: "next",
    ArrowDown: "next",
    PageUp: "first",
    Home: "first",
    PageDown: "last",
    End: "last"
  };
  function getDirectionAwareKey(key, dir) {
    if (dir !== "rtl") return key;
    return key === "ArrowLeft" ? "ArrowRight" : key === "ArrowRight" ? "ArrowLeft" : key;
  }
  __name23(getDirectionAwareKey, "getDirectionAwareKey");
  function getFocusIntent(event, orientation, dir) {
    const key = getDirectionAwareKey(event.key, dir);
    if (orientation === "vertical" && ["ArrowLeft", "ArrowRight"].includes(key)) return void 0;
    if (orientation === "horizontal" && ["ArrowUp", "ArrowDown"].includes(key)) return void 0;
    return MAP_KEY_TO_FOCUS_INTENT[key];
  }
  __name23(getFocusIntent, "getFocusIntent");
  function focusFirst2(candidates, preventScroll = false) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus({ preventScroll });
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  __name23(focusFirst2, "focusFirst");
  function wrapArray(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  __name23(wrapArray, "wrapArray");
  var Root3 = RovingFocusGroup;
  var Item = RovingFocusGroupItem;

  // node_modules/.pnpm/@radix-ui+react-menu@2.1.24_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react@_b4abbb2a563651316651d75e08bb1ff0/node_modules/@radix-ui/react-menu/dist/index.mjs
  var import_jsx_runtime15 = __toESM(require_react_shim(), 1);
  var __defProp25 = Object.defineProperty;
  var __name24 = (target, value) => __defProp25(target, "name", { value, configurable: true });
  var SELECTION_KEYS = ["Enter", " "];
  var FIRST_KEYS = ["ArrowDown", "PageUp", "Home"];
  var LAST_KEYS = ["ArrowUp", "PageDown", "End"];
  var FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
  var SUB_OPEN_KEYS = {
    ltr: [...SELECTION_KEYS, "ArrowRight"],
    rtl: [...SELECTION_KEYS, "ArrowLeft"]
  };
  var SUB_CLOSE_KEYS = {
    ltr: ["ArrowLeft"],
    rtl: ["ArrowRight"]
  };
  var MENU_NAME = "Menu";
  var [Collection2, useCollection2, createCollectionScope2] = createCollection(MENU_NAME);
  var [createMenuContext, createMenuScope] = createContextScope(MENU_NAME, [
    createCollectionScope2,
    createPopperScope,
    createRovingFocusGroupScope
  ]);
  var usePopperScope = createPopperScope();
  var useRovingFocusGroupScope = createRovingFocusGroupScope();
  var [MenuProvider, useMenuContext] = createMenuContext(MENU_NAME);
  var [MenuRootProvider, useMenuRootContext] = createMenuContext(MENU_NAME);
  var Menu = /* @__PURE__ */ __name24((props) => {
    const { __scopeMenu, open = false, children, dir, onOpenChange, modal = true } = props;
    const popperScope = usePopperScope(__scopeMenu);
    const [content, setContent] = React37.useState(null);
    const isUsingKeyboardRef = React37.useRef(false);
    const handleOpenChange = useCallbackRef(onOpenChange);
    const direction = useDirection(dir);
    React37.useEffect(() => {
      const handleKeyDown = /* @__PURE__ */ __name24(() => {
        isUsingKeyboardRef.current = true;
        document.addEventListener("pointerdown", handlePointer, { capture: true, once: true });
        document.addEventListener("pointermove", handlePointer, { capture: true, once: true });
      }, "handleKeyDown");
      const handlePointer = /* @__PURE__ */ __name24(() => isUsingKeyboardRef.current = false, "handlePointer");
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => {
        document.removeEventListener("keydown", handleKeyDown, { capture: true });
        document.removeEventListener("pointerdown", handlePointer, { capture: true });
        document.removeEventListener("pointermove", handlePointer, { capture: true });
      };
    }, []);
    React37.useEffect(() => {
      if (!open) {
        return;
      }
      const handleBlur = /* @__PURE__ */ __name24(() => handleOpenChange(false), "handleBlur");
      window.addEventListener("blur", handleBlur);
      return () => window.removeEventListener("blur", handleBlur);
    }, [open, handleOpenChange]);
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Root2, { ...popperScope, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          MenuRootProvider,
          {
            scope: __scopeMenu,
            onClose: React37.useCallback(() => handleOpenChange(false), [handleOpenChange]),
            isUsingKeyboardRef,
            dir: direction,
            modal,
            children
          }
        )
      }
    ) });
  }, "Menu");
  var MenuAnchor = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuAnchor2(props, forwardedRef) {
      const { __scopeMenu, ...anchorProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }, "MenuAnchor")
  );
  var PORTAL_NAME2 = "MenuPortal";
  var [PortalProvider2, usePortalContext2] = createMenuContext(PORTAL_NAME2, {
    forceMount: void 0
  });
  var MenuPortal = /* @__PURE__ */ __name24((props) => {
    const { __scopeMenu, forceMount, children, container } = props;
    const context = useMenuContext(PORTAL_NAME2, __scopeMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(PortalProvider2, { scope: __scopeMenu, forceMount, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Portal, { asChild: true, container, children }) }) });
  }, "MenuPortal");
  var CONTENT_NAME3 = "MenuContent";
  var [MenuContentProvider, useMenuContentContext] = createMenuContext(CONTENT_NAME3);
  var MenuContent = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuContent2(props, forwardedRef) {
      const portalContext = usePortalContext2(CONTENT_NAME3, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, props.__scopeMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Collection2.Slot, { scope: props.__scopeMenu, children: rootContext.modal ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(MenuRootContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(MenuRootContentNonModal, { ...contentProps, ref: forwardedRef }) }) }) });
    }, "MenuContent")
  );
  var MenuRootContentModal = /* @__PURE__ */ React37.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name24(function MenuRootContentModal2(props, forwardedRef) {
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const ref = React37.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      React37.useEffect(() => {
        const content = ref.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          disableOutsideScroll: true,
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault(),
            { checkForDefaultPrevented: false }
          ),
          onDismiss: () => context.onOpenChange(false)
        }
      );
    }, "MenuRootContentModal")
  );
  var MenuRootContentNonModal = /* @__PURE__ */ React37.forwardRef(/* @__PURE__ */ __name24(function MenuRootContentNonModal2(props, forwardedRef) {
    const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      MenuContentImpl,
      {
        ...props,
        ref: forwardedRef,
        trapFocus: false,
        disableOutsidePointerEvents: false,
        disableOutsideScroll: false,
        onDismiss: () => context.onOpenChange(false)
      }
    );
  }, "MenuRootContentNonModal"));
  var Slot3 = createSlot("MenuContent.ScrollLock");
  var MenuContentImpl = /* @__PURE__ */ React37.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name24(function MenuContentImpl2(props, forwardedRef) {
      const {
        __scopeMenu,
        loop = false,
        trapFocus,
        onOpenAutoFocus,
        onCloseAutoFocus,
        disableOutsidePointerEvents,
        onEntryFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        disableOutsideScroll,
        ...contentProps
      } = props;
      const context = useMenuContext(CONTENT_NAME3, __scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, __scopeMenu);
      const popperScope = usePopperScope(__scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const getItems = useCollection2(__scopeMenu);
      const [currentItemId, setCurrentItemId] = React37.useState(null);
      const contentRef = React37.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef, context.onContentChange);
      const timerRef = React37.useRef(0);
      const searchRef = React37.useRef("");
      const pointerGraceTimerRef = React37.useRef(0);
      const pointerGraceIntentRef = React37.useRef(null);
      const pointerDirRef = React37.useRef("right");
      const lastPointerXRef = React37.useRef(0);
      const ScrollLockWrapper = disableOutsideScroll ? Combination_default : React37.Fragment;
      const scrollLockWrapperProps = disableOutsideScroll ? { as: Slot3, allowPinchZoom: true } : void 0;
      const handleTypeaheadSearch = /* @__PURE__ */ __name24((key) => {
        const search = searchRef.current + key;
        const items = getItems().filter((item) => !item.disabled);
        const currentItem = document.activeElement;
        const currentMatch = items.find((item) => item.ref.current === currentItem)?.textValue;
        const values = items.map((item) => item.textValue);
        const nextMatch = getNextMatch(values, search, currentMatch);
        const newItem = items.find((item) => item.textValue === nextMatch)?.ref.current;
        (/* @__PURE__ */ __name24((function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        }), "updateSearch"))(search);
        if (newItem) {
          setTimeout(() => newItem.focus());
        }
      }, "handleTypeaheadSearch");
      React37.useEffect(() => {
        return () => window.clearTimeout(timerRef.current);
      }, []);
      useFocusGuards();
      const isPointerMovingToSubmenu = React37.useCallback((event) => {
        const isMovingTowards = pointerDirRef.current === pointerGraceIntentRef.current?.side;
        return isMovingTowards && isPointerInGraceArea(event, pointerGraceIntentRef.current?.area);
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuContentProvider,
        {
          scope: __scopeMenu,
          searchRef,
          onItemEnter: React37.useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          onItemLeave: React37.useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) return;
              contentRef.current?.focus();
              setCurrentItemId(null);
            },
            [isPointerMovingToSubmenu]
          ),
          onTriggerLeave: React37.useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          pointerGraceTimerRef,
          onPointerGraceIntentChange: React37.useCallback((intent) => {
            pointerGraceIntentRef.current = intent;
          }, []),
          children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ScrollLockWrapper, { ...scrollLockWrapperProps, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            FocusScope,
            {
              asChild: true,
              trapped: trapFocus,
              onMountAutoFocus: composeEventHandlers(onOpenAutoFocus, (event) => {
                event.preventDefault();
                contentRef.current?.focus({ preventScroll: true });
              }),
              onUnmountAutoFocus: onCloseAutoFocus,
              children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside,
                  onInteractOutside,
                  onDismiss,
                  children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                    Root3,
                    {
                      asChild: true,
                      ...rovingFocusGroupScope,
                      dir: rootContext.dir,
                      orientation: "vertical",
                      loop,
                      currentTabStopId: currentItemId,
                      onCurrentTabStopIdChange: setCurrentItemId,
                      onEntryFocus: composeEventHandlers(onEntryFocus, (event) => {
                        if (!rootContext.isUsingKeyboardRef.current) event.preventDefault();
                      }),
                      preventScrollOnEntryFocus: true,
                      children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                        Content,
                        {
                          role: "menu",
                          "aria-orientation": "vertical",
                          "data-state": getOpenState(context.open),
                          "data-radix-menu-content": "",
                          dir: rootContext.dir,
                          ...popperScope,
                          ...contentProps,
                          ref: composedRefs,
                          style: { outline: "none", ...contentProps.style },
                          onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                            const target = event.target;
                            const isKeyDownInside = target.closest("[data-radix-menu-content]") === event.currentTarget;
                            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                            const isCharacterKey = event.key.length === 1;
                            if (isKeyDownInside) {
                              if (event.key === "Tab") event.preventDefault();
                              if (!isModifierKey && isCharacterKey) handleTypeaheadSearch(event.key);
                            }
                            const content = contentRef.current;
                            if (event.target !== content) return;
                            if (!FIRST_LAST_KEYS.includes(event.key)) return;
                            event.preventDefault();
                            const items = getItems().filter((item) => !item.disabled);
                            const candidateNodes = items.map((item) => item.ref.current);
                            if (LAST_KEYS.includes(event.key)) candidateNodes.reverse();
                            focusFirst3(candidateNodes);
                          }),
                          onBlur: composeEventHandlers(props.onBlur, (event) => {
                            if (!event.currentTarget.contains(event.target)) {
                              window.clearTimeout(timerRef.current);
                              searchRef.current = "";
                            }
                          }),
                          onPointerMove: composeEventHandlers(
                            props.onPointerMove,
                            whenMouse((event) => {
                              const target = event.target;
                              const pointerXHasChanged = lastPointerXRef.current !== event.clientX;
                              if (event.currentTarget.contains(target) && pointerXHasChanged) {
                                const newDir = event.clientX > lastPointerXRef.current ? "right" : "left";
                                pointerDirRef.current = newDir;
                                lastPointerXRef.current = event.clientX;
                              }
                            })
                          )
                        }
                      )
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }, "MenuContentImpl")
  );
  var MenuGroup = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuGroup2(props, forwardedRef) {
      const { __scopeMenu, ...groupProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Primitive.div, { role: "group", ...groupProps, ref: forwardedRef });
    }, "MenuGroup")
  );
  var MenuLabel = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuLabel2(props, forwardedRef) {
      const { __scopeMenu, ...labelProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Primitive.div, { ...labelProps, ref: forwardedRef });
    }, "MenuLabel")
  );
  var ITEM_NAME2 = "MenuItem";
  var ITEM_SELECT = "menu.itemSelect";
  var MenuItem = /* @__PURE__ */ React37.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name24(function MenuItem2(props, forwardedRef) {
      const { disabled = false, onSelect, ...itemProps } = props;
      const ref = React37.useRef(null);
      const rootContext = useMenuRootContext(ITEM_NAME2, props.__scopeMenu);
      const contentContext = useMenuContentContext(ITEM_NAME2, props.__scopeMenu);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const isPointerDownRef = React37.useRef(false);
      const handleSelect = /* @__PURE__ */ __name24(() => {
        const menuItem = ref.current;
        if (!disabled && menuItem) {
          const itemSelectEvent = new CustomEvent(ITEM_SELECT, { bubbles: true, cancelable: true });
          menuItem.addEventListener(ITEM_SELECT, (event) => onSelect?.(event), { once: true });
          dispatchDiscreteCustomEvent(menuItem, itemSelectEvent);
          if (itemSelectEvent.defaultPrevented) {
            isPointerDownRef.current = false;
          } else {
            rootContext.onClose();
          }
        }
      }, "handleSelect");
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuItemImpl,
        {
          ...itemProps,
          ref: composedRefs,
          disabled,
          onClick: composeEventHandlers(props.onClick, handleSelect),
          onPointerDown: (event) => {
            props.onPointerDown?.(event);
            isPointerDownRef.current = true;
          },
          onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
            if (!isPointerDownRef.current) event.currentTarget?.click();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled || event.target !== event.currentTarget) {
              return;
            }
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (isTypingAhead && event.key === " ") {
              return;
            }
            if (SELECTION_KEYS.includes(event.key)) {
              event.currentTarget.click();
              event.preventDefault();
            }
          })
        }
      );
    }, "MenuItem")
  );
  var MenuItemImpl = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuItemImpl2(props, forwardedRef) {
      const { __scopeMenu, disabled = false, textValue, ...itemProps } = props;
      const contentContext = useMenuContentContext(ITEM_NAME2, __scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const ref = React37.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const [isFocused, setIsFocused] = React37.useState(false);
      const [textContent, setTextContent] = React37.useState("");
      React37.useEffect(() => {
        const menuItem = ref.current;
        if (menuItem) {
          setTextContent((menuItem.textContent ?? "").trim());
        }
      }, [itemProps.children]);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        Collection2.ItemSlot,
        {
          scope: __scopeMenu,
          disabled,
          textValue: textValue ?? textContent,
          children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Item, { asChild: true, ...rovingFocusGroupScope, focusable: !disabled, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            Primitive.div,
            {
              role: "menuitem",
              "data-highlighted": isFocused ? "" : void 0,
              "aria-disabled": disabled || void 0,
              "data-disabled": disabled ? "" : void 0,
              ...itemProps,
              ref: composedRefs,
              onPointerMove: composeEventHandlers(
                props.onPointerMove,
                whenMouse((event) => {
                  if (disabled) {
                    contentContext.onItemLeave(event);
                  } else {
                    contentContext.onItemEnter(event);
                    if (!event.defaultPrevented) {
                      const item = event.currentTarget;
                      item.focus({ preventScroll: true });
                    }
                  }
                })
              ),
              onPointerLeave: composeEventHandlers(
                props.onPointerLeave,
                whenMouse((event) => contentContext.onItemLeave(event))
              ),
              onFocus: composeEventHandlers(props.onFocus, () => setIsFocused(true)),
              onBlur: composeEventHandlers(props.onBlur, () => setIsFocused(false))
            }
          ) })
        }
      );
    }, "MenuItemImpl")
  );
  var MenuCheckboxItem = /* @__PURE__ */ React37.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name24(function MenuCheckboxItem2(props, forwardedRef) {
      const { checked = false, onCheckedChange, ...checkboxItemProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuItem,
        {
          role: "menuitemcheckbox",
          "aria-checked": isIndeterminate2(checked) ? "mixed" : checked,
          ...checkboxItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            checkboxItemProps.onSelect,
            () => onCheckedChange?.(isIndeterminate2(checked) ? true : !checked),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }, "MenuCheckboxItem")
  );
  var RADIO_GROUP_NAME = "MenuRadioGroup";
  var [RadioGroupProvider, useRadioGroupContext] = createMenuContext(
    RADIO_GROUP_NAME,
    { value: void 0, onValueChange: /* @__PURE__ */ __name24(() => {
    }, "onValueChange") }
  );
  var MenuRadioGroup = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuRadioGroup2(props, forwardedRef) {
      const { value, onValueChange, ...groupProps } = props;
      const handleValueChange = useCallbackRef(onValueChange);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(RadioGroupProvider, { scope: props.__scopeMenu, value, onValueChange: handleValueChange, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(MenuGroup, { ...groupProps, ref: forwardedRef }) });
    }, "MenuRadioGroup")
  );
  var RADIO_ITEM_NAME = "MenuRadioItem";
  var MenuRadioItem = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuRadioItem2(props, forwardedRef) {
      const { value, ...radioItemProps } = props;
      const context = useRadioGroupContext(RADIO_ITEM_NAME, props.__scopeMenu);
      const checked = value === context.value;
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuItem,
        {
          role: "menuitemradio",
          "aria-checked": checked,
          ...radioItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            radioItemProps.onSelect,
            () => context.onValueChange?.(value),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }, "MenuRadioItem")
  );
  var ITEM_INDICATOR_NAME = "MenuItemIndicator";
  var [ItemIndicatorProvider, useItemIndicatorContext] = createMenuContext(
    ITEM_INDICATOR_NAME,
    { checked: false }
  );
  var MenuItemIndicator = /* @__PURE__ */ React37.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name24(function MenuItemIndicator2(props, forwardedRef) {
      const { __scopeMenu, forceMount, ...itemIndicatorProps } = props;
      const indicatorContext = useItemIndicatorContext(ITEM_INDICATOR_NAME, __scopeMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        Presence,
        {
          present: forceMount || isIndeterminate2(indicatorContext.checked) || indicatorContext.checked === true,
          children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            Primitive.span,
            {
              ...itemIndicatorProps,
              ref: forwardedRef,
              "data-state": getCheckedState(indicatorContext.checked)
            }
          )
        }
      );
    }, "MenuItemIndicator")
  );
  var MenuSeparator = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuSeparator2(props, forwardedRef) {
      const { __scopeMenu, ...separatorProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        Primitive.div,
        {
          role: "separator",
          "aria-orientation": "horizontal",
          ...separatorProps,
          ref: forwardedRef
        }
      );
    }, "MenuSeparator")
  );
  var MenuArrow = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuArrow2(props, forwardedRef) {
      const { __scopeMenu, ...arrowProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }, "MenuArrow")
  );
  var SUB_NAME = "MenuSub";
  var [MenuSubProvider, useMenuSubContext] = createMenuContext(SUB_NAME);
  var MenuSub = /* @__PURE__ */ __name24((props) => {
    const { __scopeMenu, children, open = false, onOpenChange } = props;
    const parentMenuContext = useMenuContext(SUB_NAME, __scopeMenu);
    const popperScope = usePopperScope(__scopeMenu);
    const [trigger, setTrigger] = React37.useState(null);
    const [content, setContent] = React37.useState(null);
    const handleOpenChange = useCallbackRef(onOpenChange);
    React37.useEffect(() => {
      if (parentMenuContext.open === false) handleOpenChange(false);
      return () => handleOpenChange(false);
    }, [parentMenuContext.open, handleOpenChange]);
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Root2, { ...popperScope, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          MenuSubProvider,
          {
            scope: __scopeMenu,
            contentId: useId(),
            triggerId: useId(),
            trigger,
            onTriggerChange: setTrigger,
            children
          }
        )
      }
    ) });
  }, "MenuSub");
  var SUB_TRIGGER_NAME = "MenuSubTrigger";
  var MenuSubTrigger = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuSubTrigger2(props, forwardedRef) {
      const context = useMenuContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const rootContext = useMenuRootContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const contentContext = useMenuContentContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const openTimerRef = React37.useRef(null);
      const { pointerGraceTimerRef, onPointerGraceIntentChange } = contentContext;
      const scope = { __scopeMenu: props.__scopeMenu };
      const clearOpenTimer = React37.useCallback(() => {
        if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }, []);
      React37.useEffect(() => clearOpenTimer, [clearOpenTimer]);
      React37.useEffect(() => {
        const pointerGraceTimer = pointerGraceTimerRef.current;
        return () => {
          window.clearTimeout(pointerGraceTimer);
          onPointerGraceIntentChange(null);
        };
      }, [pointerGraceTimerRef, onPointerGraceIntentChange]);
      const composedRefs = useComposedRefs(forwardedRef, subContext.onTriggerChange);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(MenuAnchor, { asChild: true, ...scope, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuItemImpl,
        {
          id: subContext.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? subContext.contentId : void 0,
          "data-state": getOpenState(context.open),
          ...props,
          ref: composedRefs,
          onClick: (event) => {
            props.onClick?.(event);
            if (props.disabled || event.defaultPrevented) return;
            event.currentTarget.focus();
            if (!context.open) context.onOpenChange(true);
          },
          onPointerMove: composeEventHandlers(
            props.onPointerMove,
            whenMouse((event) => {
              contentContext.onItemEnter(event);
              if (event.defaultPrevented) return;
              if (!props.disabled && !context.open && !openTimerRef.current) {
                contentContext.onPointerGraceIntentChange(null);
                openTimerRef.current = window.setTimeout(() => {
                  context.onOpenChange(true);
                  clearOpenTimer();
                }, 100);
              }
            })
          ),
          onPointerLeave: composeEventHandlers(
            props.onPointerLeave,
            whenMouse((event) => {
              clearOpenTimer();
              const contentRect = context.content?.getBoundingClientRect();
              if (contentRect) {
                const side = context.content?.dataset.side;
                const rightSide = side === "right";
                const bleed = rightSide ? -5 : 5;
                const contentNearEdge = contentRect[rightSide ? "left" : "right"];
                const contentFarEdge = contentRect[rightSide ? "right" : "left"];
                contentContext.onPointerGraceIntentChange({
                  area: [
                    // Apply a bleed on clientX to ensure that our exit point is
                    // consistently within polygon bounds
                    { x: event.clientX + bleed, y: event.clientY },
                    { x: contentNearEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.bottom },
                    { x: contentNearEdge, y: contentRect.bottom }
                  ],
                  side
                });
                window.clearTimeout(pointerGraceTimerRef.current);
                pointerGraceTimerRef.current = window.setTimeout(
                  () => contentContext.onPointerGraceIntentChange(null),
                  300
                );
              } else {
                contentContext.onTriggerLeave(event);
                if (event.defaultPrevented) return;
                contentContext.onPointerGraceIntentChange(null);
              }
            })
          ),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (props.disabled || event.target !== event.currentTarget) {
              return;
            }
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (isTypingAhead && event.key === " ") {
              return;
            }
            if (SUB_OPEN_KEYS[rootContext.dir].includes(event.key)) {
              context.onOpenChange(true);
              context.content?.focus();
              event.preventDefault();
            }
          })
        }
      ) });
    }, "MenuSubTrigger")
  );
  var SUB_CONTENT_NAME = "MenuSubContent";
  var MenuSubContent = /* @__PURE__ */ React37.forwardRef(
    /* @__PURE__ */ __name24(function MenuSubContent2(props, forwardedRef) {
      const portalContext = usePortalContext2(CONTENT_NAME3, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, align = "start", ...subContentProps } = props;
      const context = useMenuContext(CONTENT_NAME3, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME3, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_CONTENT_NAME, props.__scopeMenu);
      const ref = React37.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Collection2.Slot, { scope: props.__scopeMenu, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        MenuContentImpl,
        {
          id: subContext.contentId,
          "aria-labelledby": subContext.triggerId,
          ...subContentProps,
          ref: composedRefs,
          align,
          side: rootContext.dir === "rtl" ? "left" : "right",
          disableOutsidePointerEvents: false,
          disableOutsideScroll: false,
          trapFocus: false,
          onOpenAutoFocus: (event) => {
            if (rootContext.isUsingKeyboardRef.current) ref.current?.focus();
            event.preventDefault();
          },
          onCloseAutoFocus: (event) => event.preventDefault(),
          onFocusOutside: composeEventHandlers(props.onFocusOutside, (event) => {
            if (event.target !== subContext.trigger) context.onOpenChange(false);
          }),
          onEscapeKeyDown: composeEventHandlers(props.onEscapeKeyDown, (event) => {
            rootContext.onClose();
            event.preventDefault();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            const isKeyDownInside = event.currentTarget.contains(event.target);
            const isCloseKey = SUB_CLOSE_KEYS[rootContext.dir].includes(event.key);
            if (isKeyDownInside && isCloseKey) {
              context.onOpenChange(false);
              subContext.trigger?.focus();
              event.preventDefault();
            }
          })
        }
      ) }) }) });
    }, "MenuSubContent")
  );
  function getOpenState(open) {
    return open ? "open" : "closed";
  }
  __name24(getOpenState, "getOpenState");
  function isIndeterminate2(checked) {
    return checked === "indeterminate";
  }
  __name24(isIndeterminate2, "isIndeterminate");
  function getCheckedState(checked) {
    return isIndeterminate2(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }
  __name24(getCheckedState, "getCheckedState");
  function focusFirst3(candidates) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus();
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  __name24(focusFirst3, "focusFirst");
  function wrapArray2(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  __name24(wrapArray2, "wrapArray");
  function getNextMatch(values, search, currentMatch) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
    let wrappedValues = wrapArray2(values, Math.max(currentMatchIndex, 0));
    const excludeCurrentMatch = normalizedSearch.length === 1;
    if (excludeCurrentMatch) wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
    const nextMatch = wrappedValues.find(
      (value) => value.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextMatch !== currentMatch ? nextMatch : void 0;
  }
  __name24(getNextMatch, "getNextMatch");
  function isPointInPolygon(point, polygon) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const ii = polygon[i];
      const jj = polygon[j];
      const xi = ii.x;
      const yi = ii.y;
      const xj = jj.x;
      const yj = jj.y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  __name24(isPointInPolygon, "isPointInPolygon");
  function isPointerInGraceArea(event, area) {
    if (!area) return false;
    const cursorPos = { x: event.clientX, y: event.clientY };
    return isPointInPolygon(cursorPos, area);
  }
  __name24(isPointerInGraceArea, "isPointerInGraceArea");
  function whenMouse(handler) {
    return (event) => event.pointerType === "mouse" ? handler(event) : void 0;
  }
  __name24(whenMouse, "whenMouse");
  var Root32 = Menu;
  var Anchor2 = MenuAnchor;
  var Portal3 = MenuPortal;
  var Content2 = MenuContent;
  var Group = MenuGroup;
  var Label = MenuLabel;
  var Item2 = MenuItem;
  var CheckboxItem = MenuCheckboxItem;
  var RadioGroup = MenuRadioGroup;
  var RadioItem = MenuRadioItem;
  var ItemIndicator = MenuItemIndicator;
  var Separator = MenuSeparator;
  var Arrow22 = MenuArrow;
  var Sub = MenuSub;
  var SubTrigger = MenuSubTrigger;
  var SubContent = MenuSubContent;

  // node_modules/.pnpm/@radix-ui+react-dropdown-menu@2.1.24_@types+react-dom@19.2.3_@types+react@19.2.17__@typ_cea3081213c77aa7bdcc6d13e3bb1673/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs
  var dist_exports7 = {};
  __export(dist_exports7, {
    Arrow: () => Arrow23,
    CheckboxItem: () => CheckboxItem2,
    Content: () => Content22,
    DropdownMenu: () => DropdownMenu,
    DropdownMenuArrow: () => DropdownMenuArrow,
    DropdownMenuCheckboxItem: () => DropdownMenuCheckboxItem,
    DropdownMenuContent: () => DropdownMenuContent,
    DropdownMenuGroup: () => DropdownMenuGroup,
    DropdownMenuItem: () => DropdownMenuItem,
    DropdownMenuItemIndicator: () => DropdownMenuItemIndicator,
    DropdownMenuLabel: () => DropdownMenuLabel,
    DropdownMenuPortal: () => DropdownMenuPortal,
    DropdownMenuRadioGroup: () => DropdownMenuRadioGroup,
    DropdownMenuRadioItem: () => DropdownMenuRadioItem,
    DropdownMenuSeparator: () => DropdownMenuSeparator,
    DropdownMenuSub: () => DropdownMenuSub,
    DropdownMenuSubContent: () => DropdownMenuSubContent,
    DropdownMenuSubTrigger: () => DropdownMenuSubTrigger,
    DropdownMenuTrigger: () => DropdownMenuTrigger,
    Group: () => Group2,
    Item: () => Item22,
    ItemIndicator: () => ItemIndicator2,
    Label: () => Label2,
    Portal: () => Portal22,
    RadioGroup: () => RadioGroup2,
    RadioItem: () => RadioItem2,
    Root: () => Root22,
    Separator: () => Separator2,
    Sub: () => Sub2,
    SubContent: () => SubContent2,
    SubTrigger: () => SubTrigger2,
    Trigger: () => Trigger,
    createDropdownMenuScope: () => createDropdownMenuScope
  });
  init_define_import_meta_env();
  var React38 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime16 = __toESM(require_react_shim(), 1);
  var __defProp26 = Object.defineProperty;
  var __name25 = (target, value) => __defProp26(target, "name", { value, configurable: true });
  var DROPDOWN_MENU_NAME = "DropdownMenu";
  var [createDropdownMenuContext, createDropdownMenuScope] = createContextScope(
    DROPDOWN_MENU_NAME,
    [createMenuScope]
  );
  var useMenuScope = createMenuScope();
  var [DropdownMenuProvider, useDropdownMenuContext] = createDropdownMenuContext(DROPDOWN_MENU_NAME);
  var DropdownMenu = /* @__PURE__ */ __name25((props) => {
    const {
      __scopeDropdownMenu,
      children,
      dir,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const triggerRef = React38.useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DROPDOWN_MENU_NAME
    });
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      DropdownMenuProvider,
      {
        scope: __scopeDropdownMenu,
        triggerId: useId(),
        triggerRef,
        contentId: useId(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: React38.useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Root32, { ...menuScope, open, onOpenChange: setOpen, dir, modal, children })
      }
    );
  }, "DropdownMenu");
  var TRIGGER_NAME3 = "DropdownMenuTrigger";
  var DropdownMenuTrigger = /* @__PURE__ */ React38.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function DropdownMenuTrigger2(props, forwardedRef) {
      const { __scopeDropdownMenu, disabled = false, ...triggerProps } = props;
      const context = useDropdownMenuContext(TRIGGER_NAME3, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const composedRefs = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Anchor2, { asChild: true, ...menuScope, children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        Primitive.button,
        {
          type: "button",
          id: context.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": context.open ? "open" : "closed",
          "data-disabled": disabled ? "" : void 0,
          disabled,
          ...triggerProps,
          ref: composedRefs,
          onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
            if (!disabled && event.button === 0 && event.ctrlKey === false) {
              context.onOpenToggle();
              if (!context.open) event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled) return;
            if (["Enter", " "].includes(event.key)) context.onOpenToggle();
            if (event.key === "ArrowDown") context.onOpenChange(true);
            if (["Enter", " ", "ArrowDown"].includes(event.key)) event.preventDefault();
          })
        }
      ) });
    }, "DropdownMenuTrigger")
  );
  var DropdownMenuPortal = /* @__PURE__ */ __name25((props) => {
    const { __scopeDropdownMenu, ...portalProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Portal3, { ...menuScope, ...portalProps });
  }, "DropdownMenuPortal");
  var CONTENT_NAME4 = "DropdownMenuContent";
  var DropdownMenuContent = /* @__PURE__ */ React38.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function DropdownMenuContent2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...contentProps } = props;
      const context = useDropdownMenuContext(CONTENT_NAME4, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const hasInteractedOutsideRef = React38.useRef(false);
      return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        Content2,
        {
          id: context.contentId,
          "aria-labelledby": context.triggerId,
          ...menuScope,
          ...contentProps,
          ref: forwardedRef,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
            hasInteractedOutsideRef.current = false;
            event.preventDefault();
          }),
          onInteractOutside: composeEventHandlers(props.onInteractOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (!context.modal || isRightClick) hasInteractedOutsideRef.current = true;
          }),
          style: {
            ...props.style,
            // re-namespace exposed content custom properties
            ...{
              "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
              "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
              "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
              "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
              "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
            }
          }
        }
      );
    }, "DropdownMenuContent")
  );
  var DropdownMenuGroup = /* @__PURE__ */ React38.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function DropdownMenuGroup2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...groupProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Group, { ...menuScope, ...groupProps, ref: forwardedRef });
    }, "DropdownMenuGroup")
  );
  var DropdownMenuLabel = /* @__PURE__ */ React38.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function DropdownMenuLabel2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...labelProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Label, { ...menuScope, ...labelProps, ref: forwardedRef });
    }, "DropdownMenuLabel")
  );
  var DropdownMenuItem = /* @__PURE__ */ React38.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function DropdownMenuItem2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...itemProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Item2, { ...menuScope, ...itemProps, ref: forwardedRef });
    }, "DropdownMenuItem")
  );
  var DropdownMenuCheckboxItem = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuCheckboxItem2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...checkboxItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(CheckboxItem, { ...menuScope, ...checkboxItemProps, ref: forwardedRef });
  }, "DropdownMenuCheckboxItem"));
  var DropdownMenuRadioGroup = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuRadioGroup2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...radioGroupProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(RadioGroup, { ...menuScope, ...radioGroupProps, ref: forwardedRef });
  }, "DropdownMenuRadioGroup"));
  var DropdownMenuRadioItem = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuRadioItem2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...radioItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(RadioItem, { ...menuScope, ...radioItemProps, ref: forwardedRef });
  }, "DropdownMenuRadioItem"));
  var DropdownMenuItemIndicator = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuItemIndicator2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...itemIndicatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ItemIndicator, { ...menuScope, ...itemIndicatorProps, ref: forwardedRef });
  }, "DropdownMenuItemIndicator"));
  var DropdownMenuSeparator = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuSeparator2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...separatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Separator, { ...menuScope, ...separatorProps, ref: forwardedRef });
  }, "DropdownMenuSeparator"));
  var DropdownMenuArrow = /* @__PURE__ */ React38.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function DropdownMenuArrow2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...arrowProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Arrow22, { ...menuScope, ...arrowProps, ref: forwardedRef });
    }, "DropdownMenuArrow")
  );
  var DropdownMenuSub = /* @__PURE__ */ __name25((props) => {
    const { __scopeDropdownMenu, children, open: openProp, onOpenChange, defaultOpen } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: "DropdownMenuSub"
    });
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Sub, { ...menuScope, open, onOpenChange: setOpen, children });
  }, "DropdownMenuSub");
  var DropdownMenuSubTrigger = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuSubTrigger2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...subTriggerProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(SubTrigger, { ...menuScope, ...subTriggerProps, ref: forwardedRef });
  }, "DropdownMenuSubTrigger"));
  var DropdownMenuSubContent = /* @__PURE__ */ React38.forwardRef(/* @__PURE__ */ __name25(function DropdownMenuSubContent2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...subContentProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      SubContent,
      {
        ...menuScope,
        ...subContentProps,
        ref: forwardedRef,
        style: {
          ...props.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
            "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
            "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  }, "DropdownMenuSubContent"));
  var Root22 = DropdownMenu;
  var Trigger = DropdownMenuTrigger;
  var Portal22 = DropdownMenuPortal;
  var Content22 = DropdownMenuContent;
  var Group2 = DropdownMenuGroup;
  var Label2 = DropdownMenuLabel;
  var Item22 = DropdownMenuItem;
  var CheckboxItem2 = DropdownMenuCheckboxItem;
  var RadioGroup2 = DropdownMenuRadioGroup;
  var RadioItem2 = DropdownMenuRadioItem;
  var ItemIndicator2 = DropdownMenuItemIndicator;
  var Separator2 = DropdownMenuSeparator;
  var Arrow23 = DropdownMenuArrow;
  var Sub2 = DropdownMenuSub;
  var SubTrigger2 = DropdownMenuSubTrigger;
  var SubContent2 = DropdownMenuSubContent;

  // node_modules/.pnpm/@radix-ui+react-label@2.1.15_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react_47bfbc0ebd7e3b516270b1b15948c886/node_modules/@radix-ui/react-label/dist/index.mjs
  var dist_exports9 = {};
  __export(dist_exports9, {
    Label: () => Label3,
    Root: () => Root4
  });
  init_define_import_meta_env();
  var React39 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime17 = __toESM(require_react_shim(), 1);
  var __defProp27 = Object.defineProperty;
  var __name26 = (target, value) => __defProp27(target, "name", { value, configurable: true });
  var Label3 = /* @__PURE__ */ React39.forwardRef(
    /* @__PURE__ */ __name26(function Label22(props, forwardedRef) {
      return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        Primitive.label,
        {
          ...props,
          ref: forwardedRef,
          onMouseDown: (event) => {
            const target = event.target;
            if (target.closest("button, input, select, textarea")) return;
            props.onMouseDown?.(event);
            if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
          }
        }
      );
    }, "Label")
  );
  var Root4 = Label3;

  // node_modules/.pnpm/@radix-ui+react-use-previous@1.1.4_@types+react@19.2.17_react@19.2.8/node_modules/@radix-ui/react-use-previous/dist/index.mjs
  init_define_import_meta_env();
  var React40 = __toESM(require_react_shim(), 1);
  var __defProp28 = Object.defineProperty;
  var __name27 = (target, value) => __defProp28(target, "name", { value, configurable: true });
  function usePrevious(value) {
    const ref = React40.useRef({ value, previous: value });
    return React40.useMemo(() => {
      if (ref.current.value !== value) {
        ref.current.previous = ref.current.value;
        ref.current.value = value;
      }
      return ref.current.previous;
    }, [value]);
  }
  __name27(usePrevious, "usePrevious");

  // node_modules/.pnpm/@radix-ui+number@1.1.3/node_modules/@radix-ui/number/dist/index.mjs
  init_define_import_meta_env();
  var __defProp29 = Object.defineProperty;
  var __name28 = (target, value) => __defProp29(target, "name", { value, configurable: true });
  function clamp2(value, [min3, max3]) {
    return Math.min(max3, Math.max(min3, value));
  }
  __name28(clamp2, "clamp");

  // node_modules/.pnpm/@radix-ui+react-popover@1.1.23_@types+react-dom@19.2.3_@types+react@19.2.17__@types+rea_bd28d99ba664df7858bf435248864de3/node_modules/@radix-ui/react-popover/dist/index.mjs
  var dist_exports10 = {};
  __export(dist_exports10, {
    Anchor: () => Anchor22,
    Arrow: () => Arrow24,
    Close: () => Close,
    Content: () => Content23,
    Popover: () => Popover,
    PopoverAnchor: () => PopoverAnchor,
    PopoverArrow: () => PopoverArrow,
    PopoverClose: () => PopoverClose,
    PopoverContent: () => PopoverContent,
    PopoverPortal: () => PopoverPortal,
    PopoverTrigger: () => PopoverTrigger,
    Portal: () => Portal4,
    Root: () => Root23,
    Trigger: () => Trigger2,
    createPopoverScope: () => createPopoverScope
  });
  init_define_import_meta_env();
  var React41 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime18 = __toESM(require_react_shim(), 1);
  var __defProp30 = Object.defineProperty;
  var __name29 = (target, value) => __defProp30(target, "name", { value, configurable: true });
  var POPOVER_NAME = "Popover";
  var [createPopoverContext, createPopoverScope] = createContextScope(POPOVER_NAME, [
    createPopperScope
  ]);
  var usePopperScope2 = createPopperScope();
  var [PopoverProvider, usePopoverContext] = createPopoverContext(POPOVER_NAME);
  var Popover = /* @__PURE__ */ __name29((props) => {
    const {
      __scopePopover,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = false
    } = props;
    const popperScope = usePopperScope2(__scopePopover);
    const triggerRef = React41.useRef(null);
    const [hasCustomAnchor, setHasCustomAnchor] = React41.useState(false);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: POPOVER_NAME
    });
    return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Root2, { ...popperScope, children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      PopoverProvider,
      {
        scope: __scopePopover,
        contentId: useId(),
        triggerRef,
        open,
        onOpenChange: setOpen,
        onOpenToggle: React41.useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        hasCustomAnchor,
        onCustomAnchorAdd: React41.useCallback(() => setHasCustomAnchor(true), []),
        onCustomAnchorRemove: React41.useCallback(() => setHasCustomAnchor(false), []),
        modal,
        children
      }
    ) });
  }, "Popover");
  var ANCHOR_NAME2 = "PopoverAnchor";
  var PopoverAnchor = /* @__PURE__ */ React41.forwardRef(
    /* @__PURE__ */ __name29(function PopoverAnchor2(props, forwardedRef) {
      const { __scopePopover, ...anchorProps } = props;
      const context = usePopoverContext(ANCHOR_NAME2, __scopePopover);
      const popperScope = usePopperScope2(__scopePopover);
      const { onCustomAnchorAdd, onCustomAnchorRemove } = context;
      React41.useEffect(() => {
        onCustomAnchorAdd();
        return () => onCustomAnchorRemove();
      }, [onCustomAnchorAdd, onCustomAnchorRemove]);
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }, "PopoverAnchor")
  );
  var TRIGGER_NAME4 = "PopoverTrigger";
  var PopoverTrigger = /* @__PURE__ */ React41.forwardRef(
    /* @__PURE__ */ __name29(function PopoverTrigger2(props, forwardedRef) {
      const { __scopePopover, ...triggerProps } = props;
      const context = usePopoverContext(TRIGGER_NAME4, __scopePopover);
      const popperScope = usePopperScope2(__scopePopover);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      const trigger = /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
        Primitive.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState3(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
      return context.hasCustomAnchor ? trigger : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Anchor, { asChild: true, ...popperScope, children: trigger });
    }, "PopoverTrigger")
  );
  var PORTAL_NAME3 = "PopoverPortal";
  var [PortalProvider3, usePortalContext3] = createPopoverContext(PORTAL_NAME3, {
    forceMount: void 0
  });
  var PopoverPortal = /* @__PURE__ */ __name29((props) => {
    const { __scopePopover, forceMount, children, container } = props;
    const context = usePopoverContext(PORTAL_NAME3, __scopePopover);
    return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(PortalProvider3, { scope: __scopePopover, forceMount, children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Portal, { asChild: true, container, children }) }) });
  }, "PopoverPortal");
  var CONTENT_NAME5 = "PopoverContent";
  var PopoverContent = /* @__PURE__ */ React41.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name29(function PopoverContent2(props, forwardedRef) {
      const portalContext = usePortalContext3(CONTENT_NAME5, props.__scopePopover);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = usePopoverContext(CONTENT_NAME5, props.__scopePopover);
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(PopoverContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(PopoverContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }, "PopoverContent")
  );
  var Slot4 = createSlot("PopoverContent.RemoveScroll");
  var PopoverContentModal = /* @__PURE__ */ React41.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name29(function PopoverContentModal2(props, forwardedRef) {
      const context = usePopoverContext(CONTENT_NAME5, props.__scopePopover);
      const contentRef = React41.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef);
      const isRightClickOutsideRef = React41.useRef(false);
      React41.useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Combination_default, { as: Slot4, allowPinchZoom: true, children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
        PopoverContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: true,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            if (!isRightClickOutsideRef.current) context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers(
            props.onPointerDownOutside,
            (event) => {
              const originalEvent = event.detail.originalEvent;
              const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
              const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
              isRightClickOutsideRef.current = isRightClick;
            },
            { checkForDefaultPrevented: false }
          ),
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault(),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }, "PopoverContentModal")
  );
  var PopoverContentNonModal = /* @__PURE__ */ React41.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name29(function PopoverContentNonModal2(props, forwardedRef) {
      const context = usePopoverContext(CONTENT_NAME5, props.__scopePopover);
      const hasInteractedOutsideRef = React41.useRef(false);
      const hasPointerDownOutsideRef = React41.useRef(false);
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
        PopoverContentImpl,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }, "PopoverContentNonModal")
  );
  var PopoverContentImpl = /* @__PURE__ */ React41.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name29(function PopoverContentImpl2(props, forwardedRef) {
      const {
        __scopePopover,
        trapFocus,
        onOpenAutoFocus,
        onCloseAutoFocus,
        disableOutsidePointerEvents,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        ...contentProps
      } = props;
      const context = usePopoverContext(CONTENT_NAME5, __scopePopover);
      const popperScope = usePopperScope2(__scopePopover);
      useFocusGuards();
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
        FocusScope,
        {
          asChild: true,
          loop: true,
          trapped: trapFocus,
          onMountAutoFocus: onOpenAutoFocus,
          onUnmountAutoFocus: onCloseAutoFocus,
          children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
            DismissableLayer,
            {
              asChild: true,
              disableOutsidePointerEvents,
              onInteractOutside,
              onEscapeKeyDown,
              onPointerDownOutside,
              onFocusOutside,
              onDismiss: () => context.onOpenChange(false),
              deferPointerDownOutside: true,
              children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
                Content,
                {
                  "data-state": getState3(context.open),
                  role: "dialog",
                  id: context.contentId,
                  ...popperScope,
                  ...contentProps,
                  ref: forwardedRef,
                  style: {
                    ...contentProps.style,
                    // re-namespace exposed content custom properties
                    ...{
                      "--radix-popover-content-transform-origin": "var(--radix-popper-transform-origin)",
                      "--radix-popover-content-available-width": "var(--radix-popper-available-width)",
                      "--radix-popover-content-available-height": "var(--radix-popper-available-height)",
                      "--radix-popover-trigger-width": "var(--radix-popper-anchor-width)",
                      "--radix-popover-trigger-height": "var(--radix-popper-anchor-height)"
                    }
                  }
                }
              )
            }
          )
        }
      );
    }, "PopoverContentImpl")
  );
  var CLOSE_NAME2 = "PopoverClose";
  var PopoverClose = /* @__PURE__ */ React41.forwardRef(
    /* @__PURE__ */ __name29(function PopoverClose2(props, forwardedRef) {
      const { __scopePopover, ...closeProps } = props;
      const context = usePopoverContext(CLOSE_NAME2, __scopePopover);
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
        Primitive.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, () => context.onOpenChange(false))
        }
      );
    }, "PopoverClose")
  );
  var PopoverArrow = /* @__PURE__ */ React41.forwardRef(
    /* @__PURE__ */ __name29(function PopoverArrow2(props, forwardedRef) {
      const { __scopePopover, ...arrowProps } = props;
      const popperScope = usePopperScope2(__scopePopover);
      return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }, "PopoverArrow")
  );
  function getState3(open) {
    return open ? "open" : "closed";
  }
  __name29(getState3, "getState");
  var Root23 = Popover;
  var Anchor22 = PopoverAnchor;
  var Trigger2 = PopoverTrigger;
  var Portal4 = PopoverPortal;
  var Content23 = PopoverContent;
  var Close = PopoverClose;
  var Arrow24 = PopoverArrow;

  // node_modules/.pnpm/@radix-ui+react-select@2.3.7_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react_4023cf783910549477f4cddf9d3442c0/node_modules/@radix-ui/react-select/dist/index.mjs
  var dist_exports11 = {};
  __export(dist_exports11, {
    Arrow: () => SelectArrow,
    Content: () => SelectContent,
    Group: () => SelectGroup,
    Icon: () => SelectIcon,
    Item: () => SelectItem,
    ItemIndicator: () => SelectItemIndicator,
    ItemText: () => SelectItemText,
    Label: () => SelectLabel,
    Portal: () => SelectPortal,
    Root: () => Select,
    ScrollDownButton: () => SelectScrollDownButton,
    ScrollUpButton: () => SelectScrollUpButton,
    Select: () => Select,
    SelectArrow: () => SelectArrow,
    SelectContent: () => SelectContent,
    SelectGroup: () => SelectGroup,
    SelectIcon: () => SelectIcon,
    SelectItem: () => SelectItem,
    SelectItemIndicator: () => SelectItemIndicator,
    SelectItemText: () => SelectItemText,
    SelectLabel: () => SelectLabel,
    SelectPortal: () => SelectPortal,
    SelectScrollDownButton: () => SelectScrollDownButton,
    SelectScrollUpButton: () => SelectScrollUpButton,
    SelectSeparator: () => SelectSeparator,
    SelectTrigger: () => SelectTrigger,
    SelectValue: () => SelectValue,
    SelectViewport: () => SelectViewport,
    Separator: () => SelectSeparator,
    Trigger: () => SelectTrigger,
    Value: () => SelectValue,
    Viewport: () => SelectViewport,
    createSelectScope: () => createSelectScope,
    unstable_BubbleInput: () => SelectBubbleInput,
    unstable_Provider: () => SelectProvider,
    unstable_SelectBubbleInput: () => SelectBubbleInput,
    unstable_SelectProvider: () => SelectProvider
  });
  init_define_import_meta_env();
  var React42 = __toESM(require_react_shim(), 1);
  var ReactDOM4 = __toESM(require_react_dom_shim(), 1);
  var import_jsx_runtime19 = __toESM(require_react_shim(), 1);
  var __defProp31 = Object.defineProperty;
  var __name30 = (target, value) => __defProp31(target, "name", { value, configurable: true });
  var OPEN_KEYS = [" ", "Enter", "ArrowUp", "ArrowDown"];
  var SELECTION_KEYS2 = [" ", "Enter"];
  var SELECT_NAME = "Select";
  var [Collection3, useCollection3, createCollectionScope3] = createCollection(SELECT_NAME);
  var [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
    createCollectionScope3,
    createPopperScope
  ]);
  var usePopperScope3 = createPopperScope();
  var [SelectProviderImpl, useSelectContext] = createSelectContext(SELECT_NAME);
  var [SelectNativeOptionsProvider, useSelectNativeOptionsContext] = createSelectContext(SELECT_NAME);
  function SelectProvider(props) {
    const {
      __scopeSelect,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      value: valueProp,
      defaultValue,
      onValueChange,
      dir,
      name,
      autoComplete,
      disabled,
      required,
      form,
      // @ts-expect-error internal render prop used by `Select` to compose its default parts
      internal_do_not_use_render
    } = props;
    const popperScope = usePopperScope3(__scopeSelect);
    const [trigger, setTrigger] = React42.useState(null);
    const [valueNode, setValueNode] = React42.useState(null);
    const [valueNodeHasChildren, setValueNodeHasChildren] = React42.useState(false);
    const direction = useDirection(dir);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: SELECT_NAME
    });
    const [value, setValue] = useControllableState({
      prop: valueProp,
      defaultProp: defaultValue,
      onChange: onValueChange,
      caller: SELECT_NAME
    });
    const triggerPointerDownPosRef = React42.useRef(null);
    const initialValueRef = React42.useRef(value);
    React42.useEffect(() => {
      const associatedForm = form ? trigger?.ownerDocument.getElementById(form) : trigger?.form;
      if (associatedForm instanceof HTMLFormElement) {
        const reset = /* @__PURE__ */ __name30(() => setValue(initialValueRef.current), "reset");
        associatedForm.addEventListener("reset", reset);
        return () => associatedForm.removeEventListener("reset", reset);
      }
    }, [form, trigger, setValue]);
    const isFormControl = trigger ? !!form || !!trigger.closest("form") : true;
    const [nativeOptionsSet, setNativeOptionsSet] = React42.useState(/* @__PURE__ */ new Set());
    const contentId = useId();
    const nativeSelectKey = Array.from(nativeOptionsSet).map((option) => option.props.value).join(";");
    const handleNativeOptionAdd = React42.useCallback((option) => {
      setNativeOptionsSet((prev) => new Set(prev).add(option));
    }, []);
    const handleNativeOptionRemove = React42.useCallback((option) => {
      setNativeOptionsSet((prev) => {
        const optionsSet = new Set(prev);
        optionsSet.delete(option);
        return optionsSet;
      });
    }, []);
    const context = {
      required,
      trigger,
      onTriggerChange: setTrigger,
      valueNode,
      onValueNodeChange: setValueNode,
      valueNodeHasChildren,
      onValueNodeHasChildrenChange: setValueNodeHasChildren,
      contentId,
      value,
      onValueChange: setValue,
      open,
      onOpenChange: setOpen,
      dir: direction,
      triggerPointerDownPosRef,
      disabled,
      name,
      autoComplete,
      form,
      nativeOptions: nativeOptionsSet,
      nativeSelectKey,
      isFormControl
    };
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Root2, { ...popperScope, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(SelectProviderImpl, { scope: __scopeSelect, ...context, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Collection3.Provider, { scope: __scopeSelect, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      SelectNativeOptionsProvider,
      {
        scope: __scopeSelect,
        onNativeOptionAdd: handleNativeOptionAdd,
        onNativeOptionRemove: handleNativeOptionRemove,
        children: isFunction3(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    ) }) }) });
  }
  __name30(SelectProvider, "SelectProvider");
  var Select = /* @__PURE__ */ __name30((props) => {
    const { __scopeSelect, children, ...providerProps } = props;
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      SelectProvider,
      {
        __scopeSelect,
        ...providerProps,
        internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(import_jsx_runtime19.Fragment, { children: [
          children,
          isFormControl ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
            SelectBubbleInput,
            {
              __scopeSelect
            }
          ) : null
        ] })
      }
    );
  }, "Select");
  var TRIGGER_NAME5 = "SelectTrigger";
  var SelectTrigger = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectTrigger2(props, forwardedRef) {
      const { __scopeSelect, disabled = false, ...triggerProps } = props;
      const popperScope = usePopperScope3(__scopeSelect);
      const context = useSelectContext(TRIGGER_NAME5, __scopeSelect);
      const isDisabled = context.disabled || disabled;
      const composedRefs = useComposedRefs(forwardedRef, context.onTriggerChange);
      const getItems = useCollection3(__scopeSelect);
      const pointerTypeRef = React42.useRef("touch");
      const [searchRef, handleTypeaheadSearch, resetTypeahead] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.value === context.value);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem !== void 0) {
          context.onValueChange(nextItem.value);
        }
      });
      const handleOpen = /* @__PURE__ */ __name30((pointerEvent) => {
        if (!isDisabled) {
          context.onOpenChange(true);
          resetTypeahead();
        }
        if (pointerEvent) {
          context.triggerPointerDownPosRef.current = {
            x: Math.round(pointerEvent.pageX),
            y: Math.round(pointerEvent.pageY)
          };
        }
      }, "handleOpen");
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Anchor, { asChild: true, ...popperScope, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
        Primitive.button,
        {
          type: "button",
          role: "combobox",
          "aria-controls": context.open ? context.contentId : void 0,
          "aria-expanded": context.open,
          "aria-required": context.required,
          "aria-autocomplete": "none",
          dir: context.dir,
          "data-state": context.open ? "open" : "closed",
          disabled: isDisabled,
          "data-disabled": isDisabled ? "" : void 0,
          "data-placeholder": shouldShowPlaceholder(context.value) ? "" : void 0,
          ...triggerProps,
          ref: composedRefs,
          onClick: composeEventHandlers(triggerProps.onClick, (event) => {
            event.currentTarget.focus();
            if (pointerTypeRef.current !== "mouse") {
              handleOpen(event);
            }
          }),
          onPointerDown: composeEventHandlers(triggerProps.onPointerDown, (event) => {
            pointerTypeRef.current = event.pointerType;
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) {
              target.releasePointerCapture(event.pointerId);
            }
            if (event.button === 0 && event.ctrlKey === false && event.pointerType === "mouse") {
              handleOpen(event);
              event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(triggerProps.onKeyDown, (event) => {
            const isTypingAhead = searchRef.current !== "";
            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
            if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
            if (isTypingAhead && event.key === " ") return;
            if (OPEN_KEYS.includes(event.key)) {
              handleOpen();
              event.preventDefault();
            }
          })
        }
      ) });
    }, "SelectTrigger")
  );
  var VALUE_NAME = "SelectValue";
  var SelectValue = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectValue2(props, forwardedRef) {
      const { __scopeSelect, className, style, children, placeholder = "", ...valueProps } = props;
      const context = useSelectContext(VALUE_NAME, __scopeSelect);
      const { onValueNodeHasChildrenChange } = context;
      const hasChildren = children !== void 0;
      const composedRefs = useComposedRefs(forwardedRef, context.onValueNodeChange);
      useLayoutEffect2(() => {
        onValueNodeHasChildrenChange(hasChildren);
      }, [onValueNodeHasChildrenChange, hasChildren]);
      const showPlaceholder = shouldShowPlaceholder(context.value);
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
        Primitive.span,
        {
          ...valueProps,
          asChild: showPlaceholder ? false : valueProps.asChild,
          ref: composedRefs,
          style: { pointerEvents: "none" },
          children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(React42.Fragment, { children: showPlaceholder ? placeholder : children }, showPlaceholder ? "placeholder" : "value")
        }
      );
    }, "SelectValue")
  );
  var SelectIcon = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectIcon2(props, forwardedRef) {
      const { __scopeSelect, children, ...iconProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Primitive.span, { "aria-hidden": true, ...iconProps, ref: forwardedRef, children: children || "\u25BC" });
    }, "SelectIcon")
  );
  var PORTAL_NAME4 = "SelectPortal";
  var [PortalProvider4, usePortalContext4] = createSelectContext(PORTAL_NAME4, {
    forceMount: void 0
  });
  var SelectPortal = /* @__PURE__ */ __name30((props) => {
    const { __scopeSelect, forceMount, ...portalProps } = props;
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(PortalProvider4, { scope: props.__scopeSelect, forceMount, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Portal, { asChild: true, ...portalProps }) });
  }, "SelectPortal");
  var CONTENT_NAME6 = "SelectContent";
  var SelectContent = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectContent2(props, forwardedRef) {
      const portalContext = usePortalContext4(CONTENT_NAME6, props.__scopeSelect);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useSelectContext(CONTENT_NAME6, props.__scopeSelect);
      const [fragment, setFragment] = React42.useState();
      useLayoutEffect2(() => {
        setFragment(new DocumentFragment());
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Presence, { present: forceMount || context.open, children: ({ present }) => present ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(SelectContentImpl, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(SelectContentFragment, { ...contentProps, fragment }) });
    }, "SelectContent")
  );
  var SelectContentFragment = /* @__PURE__ */ React42.forwardRef(/* @__PURE__ */ __name30(function SelectContentFragment2(props, forwardedRef) {
    const { __scopeSelect, children, fragment } = props;
    if (!fragment) return null;
    return ReactDOM4.createPortal(
      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(SelectContentProvider, { scope: __scopeSelect, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("div", { ref: forwardedRef, children }) }) }),
      fragment
    );
  }, "SelectContentFragment"));
  var CONTENT_MARGIN = 10;
  var [SelectContentProvider, useSelectContentContext] = createSelectContext(CONTENT_NAME6);
  var Slot5 = createSlot("SelectContent.RemoveScroll");
  var SelectContentImpl = /* @__PURE__ */ React42.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function SelectContentImpl2(props, forwardedRef) {
      const { __scopeSelect } = props;
      const {
        position = "item-aligned",
        onCloseAutoFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        //
        // PopperContent props
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions,
        //
        ...contentProps
      } = props;
      const context = useSelectContext(CONTENT_NAME6, __scopeSelect);
      const [content, setContent] = React42.useState(null);
      const [viewport, setViewport] = React42.useState(null);
      const composedRefs = useComposedRefs(forwardedRef, setContent);
      const [selectedItem, setSelectedItem] = React42.useState(null);
      const [selectedItemText, setSelectedItemText] = React42.useState(
        null
      );
      const getItems = useCollection3(__scopeSelect);
      const [isPositioned, setIsPositioned] = React42.useState(false);
      const firstValidItemFoundRef = React42.useRef(false);
      React42.useEffect(() => {
        if (content) return hideOthers(content);
      }, [content]);
      useFocusGuards();
      const focusFirst4 = React42.useCallback(
        (candidates) => {
          const [firstItem, ...restItems] = getItems().map((item) => item.ref.current);
          const [lastItem] = restItems.slice(-1);
          const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
          for (const candidate of candidates) {
            if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
            candidate?.scrollIntoView({ block: "nearest" });
            if (candidate === firstItem && viewport) viewport.scrollTop = 0;
            if (candidate === lastItem && viewport) viewport.scrollTop = viewport.scrollHeight;
            candidate?.focus();
            if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
          }
        },
        [getItems, viewport]
      );
      const focusSelectedItem = React42.useCallback(
        () => focusFirst4([selectedItem, content]),
        [focusFirst4, selectedItem, content]
      );
      React42.useEffect(() => {
        if (isPositioned) {
          focusSelectedItem();
        }
      }, [isPositioned, focusSelectedItem]);
      const { onOpenChange, triggerPointerDownPosRef } = context;
      React42.useEffect(() => {
        if (content) {
          let pointerMoveDelta = { x: 0, y: 0 };
          const handlePointerMove = /* @__PURE__ */ __name30((event) => {
            pointerMoveDelta = {
              x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
              y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0))
            };
          }, "handlePointerMove");
          const handlePointerUp = /* @__PURE__ */ __name30((event) => {
            if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
              event.preventDefault();
            } else {
              if (!event.composedPath().includes(content)) {
                onOpenChange(false);
              }
            }
            document.removeEventListener("pointermove", handlePointerMove);
            triggerPointerDownPosRef.current = null;
          }, "handlePointerUp");
          if (triggerPointerDownPosRef.current !== null) {
            document.addEventListener("pointermove", handlePointerMove);
            document.addEventListener("pointerup", handlePointerUp, { capture: true, once: true });
          }
          return () => {
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp, { capture: true });
          };
        }
      }, [content, onOpenChange, triggerPointerDownPosRef]);
      React42.useEffect(() => {
        const close = /* @__PURE__ */ __name30(() => onOpenChange(false), "close");
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
        return () => {
          window.removeEventListener("blur", close);
          window.removeEventListener("resize", close);
        };
      }, [onOpenChange]);
      const [searchRef, handleTypeaheadSearch] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.ref.current === document.activeElement);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem) {
          setTimeout(() => nextItem.ref.current?.focus());
        }
      });
      const itemRefCallback = React42.useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItem(node);
            if (isFirstValidItem) firstValidItemFoundRef.current = true;
          }
        },
        [context.value]
      );
      const handleItemLeave = React42.useCallback(() => content?.focus(), [content]);
      const itemTextRefCallback = React42.useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItemText(node);
          }
        },
        [context.value]
      );
      const SelectPosition = position === "popper" ? SelectPopperPosition : SelectItemAlignedPosition;
      const popperContentProps = SelectPosition === SelectPopperPosition ? {
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions
      } : {};
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
        SelectContentProvider,
        {
          scope: __scopeSelect,
          content,
          viewport,
          onViewportChange: setViewport,
          itemRefCallback,
          selectedItem,
          onItemLeave: handleItemLeave,
          itemTextRefCallback,
          focusSelectedItem,
          selectedItemText,
          position,
          isPositioned,
          searchRef,
          children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Combination_default, { as: Slot5, allowPinchZoom: true, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
            FocusScope,
            {
              asChild: true,
              trapped: context.open,
              onMountAutoFocus: (event) => {
                event.preventDefault();
              },
              onUnmountAutoFocus: composeEventHandlers(onCloseAutoFocus, (event) => {
                context.trigger?.focus({ preventScroll: true });
                event.preventDefault();
              }),
              children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents: true,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside: (event) => event.preventDefault(),
                  onDismiss: () => context.onOpenChange(false),
                  children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
                    SelectPosition,
                    {
                      role: "listbox",
                      id: context.contentId,
                      "data-state": context.open ? "open" : "closed",
                      dir: context.dir,
                      onContextMenu: (event) => event.preventDefault(),
                      ...contentProps,
                      ...popperContentProps,
                      onPlaced: () => setIsPositioned(true),
                      ref: composedRefs,
                      style: {
                        // flex layout so we can place the scroll buttons properly
                        display: "flex",
                        flexDirection: "column",
                        // reset the outline by default as the content MAY get focused
                        outline: "none",
                        ...contentProps.style
                      },
                      onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                        const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                        if (event.key === "Tab") event.preventDefault();
                        if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
                        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                          const items = getItems().filter((item) => !item.disabled);
                          let candidateNodes = items.map((item) => item.ref.current);
                          if (["ArrowUp", "End"].includes(event.key)) {
                            candidateNodes = candidateNodes.slice().reverse();
                          }
                          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                            const currentElement = event.target;
                            const currentIndex = candidateNodes.indexOf(currentElement);
                            candidateNodes = candidateNodes.slice(currentIndex + 1);
                          }
                          setTimeout(() => focusFirst4(candidateNodes));
                          event.preventDefault();
                        }
                      })
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }, "SelectContentImpl")
  );
  var SelectItemAlignedPosition = /* @__PURE__ */ React42.forwardRef(/* @__PURE__ */ __name30(function SelectItemAlignedPosition2(props, forwardedRef) {
    const { __scopeSelect, onPlaced, ...popperProps } = props;
    const context = useSelectContext(CONTENT_NAME6, __scopeSelect);
    const contentContext = useSelectContentContext(CONTENT_NAME6, __scopeSelect);
    const [contentWrapper, setContentWrapper] = React42.useState(null);
    const [content, setContent] = React42.useState(null);
    const composedRefs = useComposedRefs(forwardedRef, setContent);
    const getItems = useCollection3(__scopeSelect);
    const shouldExpandOnScrollRef = React42.useRef(false);
    const shouldRepositionRef = React42.useRef(true);
    const { viewport, selectedItem, selectedItemText, focusSelectedItem } = contentContext;
    const position = React42.useCallback(() => {
      if (context.trigger && context.valueNode && contentWrapper && content && viewport && selectedItem && selectedItemText) {
        const triggerRect = context.trigger.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const valueNodeRect = context.valueNode.getBoundingClientRect();
        const itemTextRect = selectedItemText.getBoundingClientRect();
        if (context.dir !== "rtl") {
          const itemTextOffset = itemTextRect.left - contentRect.left;
          const left = valueNodeRect.left - itemTextOffset;
          const leftDelta = triggerRect.left - left;
          const minContentWidth = triggerRect.width + leftDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const rightEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedLeft = clamp2(left, [
            CONTENT_MARGIN,
            // Prevents the content from going off the starting edge of the
            // viewport. It may still go off the ending edge, but this can be
            // controlled by the user since they may want to manage overflow in a
            // specific way.
            // https://github.com/radix-ui/primitives/issues/2049
            Math.max(CONTENT_MARGIN, rightEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.left = clampedLeft + "px";
        } else {
          const itemTextOffset = contentRect.right - itemTextRect.right;
          const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
          const rightDelta = window.innerWidth - triggerRect.right - right;
          const minContentWidth = triggerRect.width + rightDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const leftEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedRight = clamp2(right, [
            CONTENT_MARGIN,
            Math.max(CONTENT_MARGIN, leftEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.right = clampedRight + "px";
        }
        const items = getItems();
        const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
        const itemsHeight = viewport.scrollHeight;
        const contentStyles = window.getComputedStyle(content);
        const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
        const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
        const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
        const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
        const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth;
        const minContentHeight = Math.min(selectedItem.offsetHeight * 5, fullContentHeight);
        const viewportStyles = window.getComputedStyle(viewport);
        const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
        const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);
        const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
        const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;
        const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
        const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
        const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
        const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;
        const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;
        if (willAlignWithoutTopOverflow) {
          const isLastItem = items.length > 0 && selectedItem === items[items.length - 1].ref.current;
          contentWrapper.style.bottom = "0px";
          const viewportOffsetBottom = content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
          const clampedTriggerMiddleToBottomEdge = Math.max(
            triggerMiddleToBottomEdge,
            selectedItemHalfHeight + // viewport might have padding bottom, include it to avoid a scrollable viewport
            (isLastItem ? viewportPaddingBottom : 0) + viewportOffsetBottom + contentBorderBottomWidth
          );
          const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
          contentWrapper.style.height = height + "px";
        } else {
          const isFirstItem = items.length > 0 && selectedItem === items[0].ref.current;
          contentWrapper.style.top = "0px";
          const clampedTopEdgeToTriggerMiddle = Math.max(
            topEdgeToTriggerMiddle,
            contentBorderTopWidth + viewport.offsetTop + // viewport might have padding top, include it to avoid a scrollable viewport
            (isFirstItem ? viewportPaddingTop : 0) + selectedItemHalfHeight
          );
          const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
          contentWrapper.style.height = height + "px";
          viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
        }
        contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
        contentWrapper.style.minHeight = minContentHeight + "px";
        contentWrapper.style.maxHeight = availableHeight + "px";
        onPlaced?.();
        requestAnimationFrame(() => shouldExpandOnScrollRef.current = true);
      }
    }, [
      getItems,
      context.trigger,
      context.valueNode,
      contentWrapper,
      content,
      viewport,
      selectedItem,
      selectedItemText,
      context.dir,
      onPlaced
    ]);
    useLayoutEffect2(() => position(), [position]);
    const [contentZIndex, setContentZIndex] = React42.useState();
    useLayoutEffect2(() => {
      if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
    }, [content]);
    const handleScrollButtonChange = React42.useCallback(
      (node) => {
        if (node && shouldRepositionRef.current === true) {
          position();
          focusSelectedItem?.();
          shouldRepositionRef.current = false;
        }
      },
      [position, focusSelectedItem]
    );
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      SelectViewportProvider,
      {
        scope: __scopeSelect,
        contentWrapper,
        shouldExpandOnScrollRef,
        onScrollButtonChange: handleScrollButtonChange,
        children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          "div",
          {
            ref: setContentWrapper,
            style: {
              display: "flex",
              flexDirection: "column",
              position: "fixed",
              zIndex: contentZIndex
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
              Primitive.div,
              {
                ...popperProps,
                ref: composedRefs,
                style: {
                  // When we get the height of the content, it includes borders. If we were to set
                  // the height without having `boxSizing: 'border-box'` it would be too big.
                  boxSizing: "border-box",
                  // We need to ensure the content doesn't get taller than the wrapper
                  maxHeight: "100%",
                  ...popperProps.style
                }
              }
            )
          }
        )
      }
    );
  }, "SelectItemAlignedPosition"));
  var SelectPopperPosition = /* @__PURE__ */ React42.forwardRef(/* @__PURE__ */ __name30(function SelectPopperPosition2(props, forwardedRef) {
    const {
      __scopeSelect,
      align = "start",
      collisionPadding = CONTENT_MARGIN,
      ...popperProps
    } = props;
    const popperScope = usePopperScope3(__scopeSelect);
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      Content,
      {
        ...popperScope,
        ...popperProps,
        ref: forwardedRef,
        align,
        collisionPadding,
        style: {
          // Ensure border-box for floating-ui calculations
          boxSizing: "border-box",
          ...popperProps.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-select-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-select-content-available-width": "var(--radix-popper-available-width)",
            "--radix-select-content-available-height": "var(--radix-popper-available-height)",
            "--radix-select-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-select-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  }, "SelectPopperPosition"));
  var [SelectViewportProvider, useSelectViewportContext] = createSelectContext(CONTENT_NAME6, {});
  var VIEWPORT_NAME = "SelectViewport";
  var SelectViewport = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectViewport2(props, forwardedRef) {
      const { __scopeSelect, nonce, ...viewportProps } = props;
      const contentContext = useSelectContentContext(VIEWPORT_NAME, __scopeSelect);
      const viewportContext = useSelectViewportContext(VIEWPORT_NAME, __scopeSelect);
      const composedRefs = useComposedRefs(forwardedRef, contentContext.onViewportChange);
      const prevScrollTopRef = React42.useRef(0);
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(import_jsx_runtime19.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`
            },
            nonce
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          Primitive.div,
          {
            "data-radix-select-viewport": "",
            role: "presentation",
            ...viewportProps,
            ref: composedRefs,
            style: {
              // we use position: 'relative' here on the `viewport` so that when we call
              // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
              // (independent of the scrollUpButton).
              position: "relative",
              flex: 1,
              // Viewport should only be scrollable in the vertical direction.
              // This won't work in vertical writing modes, so we'll need to
              // revisit this if/when that is supported
              // https://developer.chrome.com/blog/vertical-form-controls
              overflow: "hidden auto",
              ...viewportProps.style
            },
            onScroll: composeEventHandlers(viewportProps.onScroll, (event) => {
              const viewport = event.currentTarget;
              const { contentWrapper, shouldExpandOnScrollRef } = viewportContext;
              if (shouldExpandOnScrollRef?.current && contentWrapper) {
                const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
                if (scrolledBy > 0) {
                  const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
                  const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
                  const cssHeight = parseFloat(contentWrapper.style.height);
                  const prevHeight = Math.max(cssMinHeight, cssHeight);
                  if (prevHeight < availableHeight) {
                    const nextHeight = prevHeight + scrolledBy;
                    const clampedNextHeight = Math.min(availableHeight, nextHeight);
                    const heightDiff = nextHeight - clampedNextHeight;
                    contentWrapper.style.height = clampedNextHeight + "px";
                    if (contentWrapper.style.bottom === "0px") {
                      viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
                      contentWrapper.style.justifyContent = "flex-end";
                    }
                  }
                }
              }
              prevScrollTopRef.current = viewport.scrollTop;
            })
          }
        ) })
      ] });
    }, "SelectViewport")
  );
  var GROUP_NAME2 = "SelectGroup";
  var [SelectGroupContextProvider, useSelectGroupContext] = createSelectContext(GROUP_NAME2);
  var SelectGroup = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectGroup2(props, forwardedRef) {
      const { __scopeSelect, ...groupProps } = props;
      const groupId = useId();
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(SelectGroupContextProvider, { scope: __scopeSelect, id: groupId, children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Primitive.div, { role: "group", "aria-labelledby": groupId, ...groupProps, ref: forwardedRef }) });
    }, "SelectGroup")
  );
  var LABEL_NAME = "SelectLabel";
  var SelectLabel = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectLabel2(props, forwardedRef) {
      const { __scopeSelect, ...labelProps } = props;
      const groupContext = useSelectGroupContext(LABEL_NAME, __scopeSelect);
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Primitive.div, { id: groupContext.id, ...labelProps, ref: forwardedRef });
    }, "SelectLabel")
  );
  var ITEM_NAME3 = "SelectItem";
  var [SelectItemContextProvider, useSelectItemContext] = createSelectContext(ITEM_NAME3);
  var SelectItem = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectItem2(props, forwardedRef) {
      const {
        __scopeSelect,
        value,
        disabled = false,
        textValue: textValueProp,
        ...itemProps
      } = props;
      const context = useSelectContext(ITEM_NAME3, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_NAME3, __scopeSelect);
      const isSelected = context.value === value;
      const [textValue, setTextValue] = React42.useState(textValueProp ?? "");
      const [isFocused, setIsFocused] = React42.useState(false);
      const handleItemRefCallback = useCallbackRef(
        (node) => contentContext.itemRefCallback?.(node, value, disabled)
      );
      const composedRefs = useComposedRefs(forwardedRef, handleItemRefCallback);
      const textId = useId();
      const pointerTypeRef = React42.useRef("touch");
      const handleSelect = /* @__PURE__ */ __name30(() => {
        if (!disabled) {
          context.onValueChange(value);
          context.onOpenChange(false);
        }
      }, "handleSelect");
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
        SelectItemContextProvider,
        {
          scope: __scopeSelect,
          value,
          disabled,
          textId,
          isSelected,
          onItemTextChange: React42.useCallback((node) => {
            setTextValue((prevTextValue) => prevTextValue || (node?.textContent ?? "").trim());
          }, []),
          children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
            Collection3.ItemSlot,
            {
              scope: __scopeSelect,
              value,
              disabled,
              textValue,
              children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
                Primitive.div,
                {
                  role: "option",
                  "aria-labelledby": textId,
                  "data-highlighted": isFocused ? "" : void 0,
                  "aria-selected": isSelected && isFocused,
                  "data-state": isSelected ? "checked" : "unchecked",
                  "aria-disabled": disabled || void 0,
                  "data-disabled": disabled ? "" : void 0,
                  tabIndex: disabled ? void 0 : -1,
                  ...itemProps,
                  ref: composedRefs,
                  onFocus: composeEventHandlers(itemProps.onFocus, () => setIsFocused(true)),
                  onBlur: composeEventHandlers(itemProps.onBlur, () => setIsFocused(false)),
                  onClick: composeEventHandlers(itemProps.onClick, () => {
                    if (pointerTypeRef.current !== "mouse") handleSelect();
                  }),
                  onPointerUp: composeEventHandlers(itemProps.onPointerUp, () => {
                    if (pointerTypeRef.current === "mouse") handleSelect();
                  }),
                  onPointerDown: composeEventHandlers(itemProps.onPointerDown, (event) => {
                    pointerTypeRef.current = event.pointerType;
                  }),
                  onPointerMove: composeEventHandlers(itemProps.onPointerMove, (event) => {
                    pointerTypeRef.current = event.pointerType;
                    if (disabled) {
                      contentContext.onItemLeave?.();
                    } else if (pointerTypeRef.current === "mouse") {
                      event.currentTarget.focus({ preventScroll: true });
                    }
                  }),
                  onPointerLeave: composeEventHandlers(itemProps.onPointerLeave, (event) => {
                    if (event.currentTarget === document.activeElement) {
                      contentContext.onItemLeave?.();
                    }
                  }),
                  onKeyDown: composeEventHandlers(itemProps.onKeyDown, (event) => {
                    if (disabled || event.target !== event.currentTarget) {
                      return;
                    }
                    const isTypingAhead = contentContext.searchRef?.current !== "";
                    if (isTypingAhead && event.key === " ") {
                      return;
                    }
                    if (SELECTION_KEYS2.includes(event.key)) {
                      handleSelect();
                    }
                    if (event.key === " ") {
                      event.preventDefault();
                    }
                  })
                }
              )
            }
          )
        }
      );
    }, "SelectItem")
  );
  var ITEM_TEXT_NAME = "SelectItemText";
  var SelectItemText = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectItemText2(props, forwardedRef) {
      const { __scopeSelect, className, style, ...itemTextProps } = props;
      const context = useSelectContext(ITEM_TEXT_NAME, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_TEXT_NAME, __scopeSelect);
      const itemContext = useSelectItemContext(ITEM_TEXT_NAME, __scopeSelect);
      const nativeOptionsContext = useSelectNativeOptionsContext(ITEM_TEXT_NAME, __scopeSelect);
      const [itemTextNode, setItemTextNode] = React42.useState(null);
      const handleItemTextRefCallback = useCallbackRef(
        (node) => contentContext.itemTextRefCallback?.(node, itemContext.value, itemContext.disabled)
      );
      const composedRefs = useComposedRefs(
        forwardedRef,
        setItemTextNode,
        itemContext.onItemTextChange,
        handleItemTextRefCallback
      );
      const textContent = itemTextNode?.textContent;
      const nativeOption = React42.useMemo(
        () => /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("option", { value: itemContext.value, disabled: itemContext.disabled, children: textContent }, itemContext.value),
        [itemContext.disabled, itemContext.value, textContent]
      );
      const { onNativeOptionAdd, onNativeOptionRemove } = nativeOptionsContext;
      useLayoutEffect2(() => {
        onNativeOptionAdd(nativeOption);
        return () => onNativeOptionRemove(nativeOption);
      }, [onNativeOptionAdd, onNativeOptionRemove, nativeOption]);
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(import_jsx_runtime19.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Primitive.span, { id: itemContext.textId, ...itemTextProps, ref: composedRefs }),
        itemContext.isSelected && context.valueNode && !context.valueNodeHasChildren && !shouldShowPlaceholder(context.value) ? ReactDOM4.createPortal(itemTextProps.children, context.valueNode) : null
      ] });
    }, "SelectItemText")
  );
  var ITEM_INDICATOR_NAME2 = "SelectItemIndicator";
  var SelectItemIndicator = /* @__PURE__ */ React42.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function SelectItemIndicator2(props, forwardedRef) {
      const { __scopeSelect, ...itemIndicatorProps } = props;
      const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME2, __scopeSelect);
      return itemContext.isSelected ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Primitive.span, { "aria-hidden": true, ...itemIndicatorProps, ref: forwardedRef }) : null;
    }, "SelectItemIndicator")
  );
  var SCROLL_UP_BUTTON_NAME = "SelectScrollUpButton";
  var SelectScrollUpButton = /* @__PURE__ */ React42.forwardRef(/* @__PURE__ */ __name30(function SelectScrollUpButton2(props, forwardedRef) {
    const contentContext = useSelectContentContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const [canScrollUp, setCanScrollUp] = React42.useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const canScrollUp2 = viewport.scrollTop > 0;
          setCanScrollUp(canScrollUp2);
        };
        var handleScroll2 = handleScroll22;
        __name30(handleScroll22, "handleScroll");
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollUp ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  }, "SelectScrollUpButton"));
  var SCROLL_DOWN_BUTTON_NAME = "SelectScrollDownButton";
  var SelectScrollDownButton = /* @__PURE__ */ React42.forwardRef(/* @__PURE__ */ __name30(function SelectScrollDownButton2(props, forwardedRef) {
    const contentContext = useSelectContentContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const [canScrollDown, setCanScrollDown] = React42.useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const maxScroll = viewport.scrollHeight - viewport.clientHeight;
          const canScrollDown2 = Math.ceil(viewport.scrollTop) < maxScroll;
          setCanScrollDown(canScrollDown2);
        };
        var handleScroll2 = handleScroll22;
        __name30(handleScroll22, "handleScroll");
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollDown ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  }, "SelectScrollDownButton"));
  var SelectScrollButtonImpl = /* @__PURE__ */ React42.forwardRef(/* @__PURE__ */ __name30(function SelectScrollButtonImpl2(props, forwardedRef) {
    const { __scopeSelect, onAutoScroll, ...scrollIndicatorProps } = props;
    const contentContext = useSelectContentContext("SelectScrollButton", __scopeSelect);
    const autoScrollTimerRef = React42.useRef(null);
    const getItems = useCollection3(__scopeSelect);
    const clearAutoScrollTimer = React42.useCallback(() => {
      if (autoScrollTimerRef.current !== null) {
        window.clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    }, []);
    React42.useEffect(() => {
      return () => clearAutoScrollTimer();
    }, [clearAutoScrollTimer]);
    useLayoutEffect2(() => {
      const activeItem = getItems().find((item) => item.ref.current === document.activeElement);
      activeItem?.ref.current?.scrollIntoView({ block: "nearest" });
    }, [getItems]);
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
      Primitive.div,
      {
        "aria-hidden": true,
        ...scrollIndicatorProps,
        ref: forwardedRef,
        style: { flexShrink: 0, ...scrollIndicatorProps.style },
        onPointerDown: composeEventHandlers(scrollIndicatorProps.onPointerDown, () => {
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerMove: composeEventHandlers(scrollIndicatorProps.onPointerMove, () => {
          contentContext.onItemLeave?.();
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerLeave: composeEventHandlers(scrollIndicatorProps.onPointerLeave, () => {
          clearAutoScrollTimer();
        })
      }
    );
  }, "SelectScrollButtonImpl"));
  var SelectSeparator = /* @__PURE__ */ React42.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function SelectSeparator2(props, forwardedRef) {
      const { __scopeSelect, ...separatorProps } = props;
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Primitive.div, { "aria-hidden": true, ...separatorProps, ref: forwardedRef });
    }, "SelectSeparator")
  );
  var ARROW_NAME2 = "SelectArrow";
  var SelectArrow = /* @__PURE__ */ React42.forwardRef(
    /* @__PURE__ */ __name30(function SelectArrow2(props, forwardedRef) {
      const { __scopeSelect, ...arrowProps } = props;
      const popperScope = usePopperScope3(__scopeSelect);
      const contentContext = useSelectContentContext(ARROW_NAME2, __scopeSelect);
      return contentContext.position === "popper" ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef }) : null;
    }, "SelectArrow")
  );
  var BUBBLE_INPUT_NAME2 = "SelectBubbleInput";
  var SelectBubbleInput = /* @__PURE__ */ React42.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function SelectBubbleInput2({ __scopeSelect, ...props }, forwardedRef) {
      const context = useSelectContext(BUBBLE_INPUT_NAME2, __scopeSelect);
      const { value, onValueChange, required, disabled, name, autoComplete, form } = context;
      const { nativeOptions, nativeSelectKey } = context;
      const ref = React42.useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const selectValue = value ?? "";
      const prevValue = usePrevious(selectValue);
      const hasEmptyValueOption = Array.from(nativeOptions).some(
        (option) => (option.props.value ?? "") === ""
      );
      React42.useEffect(() => {
        const select = ref.current;
        if (!select) return;
        const selectProto = window.HTMLSelectElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          selectProto,
          "value"
        );
        const setValue = descriptor.set;
        if (prevValue !== selectValue && setValue) {
          const event = new Event("change", { bubbles: true });
          setValue.call(select, selectValue);
          select.dispatchEvent(event);
        }
      }, [prevValue, selectValue]);
      return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
        Primitive.select,
        {
          "aria-hidden": true,
          required,
          tabIndex: -1,
          name,
          autoComplete,
          disabled,
          form,
          onChange: (event) => onValueChange(event.target.value),
          ...props,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style },
          ref: composedRefs,
          defaultValue: selectValue,
          children: [
            shouldShowPlaceholder(value) && !hasEmptyValueOption ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("option", { value: "" }) : null,
            Array.from(nativeOptions)
          ]
        },
        nativeSelectKey
      );
    }, "SelectBubbleInput")
  );
  function isFunction3(value) {
    return typeof value === "function";
  }
  __name30(isFunction3, "isFunction");
  function shouldShowPlaceholder(value) {
    return value === "" || value === void 0;
  }
  __name30(shouldShowPlaceholder, "shouldShowPlaceholder");
  function useTypeaheadSearch(onSearchChange) {
    const handleSearchChange = useCallbackRef(onSearchChange);
    const searchRef = React42.useRef("");
    const timerRef = React42.useRef(0);
    const handleTypeaheadSearch = React42.useCallback(
      (key) => {
        const search = searchRef.current + key;
        handleSearchChange(search);
        (/* @__PURE__ */ __name30((function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        }), "updateSearch"))(search);
      },
      [handleSearchChange]
    );
    const resetTypeahead = React42.useCallback(() => {
      searchRef.current = "";
      window.clearTimeout(timerRef.current);
    }, []);
    React42.useEffect(() => {
      return () => window.clearTimeout(timerRef.current);
    }, []);
    return [searchRef, handleTypeaheadSearch, resetTypeahead];
  }
  __name30(useTypeaheadSearch, "useTypeaheadSearch");
  function findNextItem(items, search, currentItem) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
    let wrappedItems = wrapArray3(items, Math.max(currentItemIndex, 0));
    const excludeCurrentItem = normalizedSearch.length === 1;
    if (excludeCurrentItem) wrappedItems = wrappedItems.filter((v) => v !== currentItem);
    const nextItem = wrappedItems.find(
      (item) => item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextItem !== currentItem ? nextItem : void 0;
  }
  __name30(findNextItem, "findNextItem");
  function wrapArray3(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  __name30(wrapArray3, "wrapArray");

  // node_modules/.pnpm/@radix-ui+react-tabs@1.1.21_@types+react-dom@19.2.3_@types+react@19.2.17__@types+react@_169bb89de0cca18fe51d304cf3ee9a1d/node_modules/@radix-ui/react-tabs/dist/index.mjs
  var dist_exports12 = {};
  __export(dist_exports12, {
    Content: () => Content3,
    List: () => List,
    Root: () => Root24,
    Tabs: () => Tabs,
    TabsContent: () => TabsContent,
    TabsList: () => TabsList,
    TabsTrigger: () => TabsTrigger,
    Trigger: () => Trigger3,
    createTabsScope: () => createTabsScope
  });
  init_define_import_meta_env();
  var React43 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime20 = __toESM(require_react_shim(), 1);
  var __defProp32 = Object.defineProperty;
  var __name31 = (target, value) => __defProp32(target, "name", { value, configurable: true });
  var TABS_NAME = "Tabs";
  var [createTabsContext, createTabsScope] = createContextScope(TABS_NAME, [
    createRovingFocusGroupScope
  ]);
  var useRovingFocusGroupScope2 = createRovingFocusGroupScope();
  var [TabsProvider, useTabsContext] = createTabsContext(TABS_NAME);
  var Tabs = /* @__PURE__ */ React43.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name31(function Tabs2(props, forwardedRef) {
      const {
        __scopeTabs,
        value: valueProp,
        onValueChange,
        defaultValue,
        orientation = "horizontal",
        dir,
        activationMode = "automatic",
        ...tabsProps
      } = props;
      const direction = useDirection(dir);
      const [value, setValue] = useControllableState({
        prop: valueProp,
        onChange: onValueChange,
        defaultProp: defaultValue ?? "",
        caller: TABS_NAME
      });
      return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
        TabsProvider,
        {
          scope: __scopeTabs,
          baseId: useId(),
          value,
          onValueChange: setValue,
          orientation,
          dir: direction,
          activationMode,
          children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
            Primitive.div,
            {
              dir: direction,
              "data-orientation": orientation,
              ...tabsProps,
              ref: forwardedRef
            }
          )
        }
      );
    }, "Tabs")
  );
  var TAB_LIST_NAME = "TabsList";
  var TabsList = /* @__PURE__ */ React43.forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name31(function TabsList2(props, forwardedRef) {
      const { __scopeTabs, loop = true, ...listProps } = props;
      const context = useTabsContext(TAB_LIST_NAME, __scopeTabs);
      const rovingFocusGroupScope = useRovingFocusGroupScope2(__scopeTabs);
      return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
        Root3,
        {
          asChild: true,
          ...rovingFocusGroupScope,
          orientation: context.orientation,
          dir: context.dir,
          loop,
          children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
            Primitive.div,
            {
              role: "tablist",
              "aria-orientation": context.orientation,
              ...listProps,
              ref: forwardedRef
            }
          )
        }
      );
    }, "TabsList")
  );
  var TRIGGER_NAME6 = "TabsTrigger";
  var TabsTrigger = /* @__PURE__ */ React43.forwardRef(
    /* @__PURE__ */ __name31(function TabsTrigger2(props, forwardedRef) {
      const { __scopeTabs, value, disabled = false, ...triggerProps } = props;
      const context = useTabsContext(TRIGGER_NAME6, __scopeTabs);
      const rovingFocusGroupScope = useRovingFocusGroupScope2(__scopeTabs);
      const triggerId = makeTriggerId(context.baseId, value);
      const contentId = makeContentId(context.baseId, value);
      const isSelected = value === context.value;
      return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
        Item,
        {
          asChild: true,
          ...rovingFocusGroupScope,
          focusable: !disabled,
          active: isSelected,
          children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
            Primitive.button,
            {
              type: "button",
              role: "tab",
              "aria-selected": isSelected,
              "aria-controls": contentId,
              "data-state": isSelected ? "active" : "inactive",
              "data-disabled": disabled ? "" : void 0,
              disabled,
              id: triggerId,
              ...triggerProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!disabled && event.button === 0 && event.ctrlKey === false) {
                  context.onValueChange(value);
                } else {
                  event.preventDefault();
                }
              }),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if (disabled || event.target !== event.currentTarget) {
                  return;
                }
                if ([" ", "Enter"].includes(event.key)) {
                  context.onValueChange(value);
                }
              }),
              onFocus: composeEventHandlers(props.onFocus, () => {
                const isAutomaticActivation = context.activationMode !== "manual";
                if (!isSelected && !disabled && isAutomaticActivation) {
                  context.onValueChange(value);
                }
              })
            }
          )
        }
      );
    }, "TabsTrigger")
  );
  var CONTENT_NAME7 = "TabsContent";
  var TabsContent = /* @__PURE__ */ React43.forwardRef(
    /* @__PURE__ */ __name31(function TabsContent2(props, forwardedRef) {
      const { __scopeTabs, value, forceMount, children, ...contentProps } = props;
      const context = useTabsContext(CONTENT_NAME7, __scopeTabs);
      const triggerId = makeTriggerId(context.baseId, value);
      const contentId = makeContentId(context.baseId, value);
      const isSelected = value === context.value;
      const isMountAnimationPreventedRef = React43.useRef(isSelected);
      React43.useEffect(() => {
        const rAF = requestAnimationFrame(() => isMountAnimationPreventedRef.current = false);
        return () => cancelAnimationFrame(rAF);
      }, []);
      return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(Presence, { present: forceMount || isSelected, children: ({ present }) => /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
        Primitive.div,
        {
          "data-state": isSelected ? "active" : "inactive",
          "data-orientation": context.orientation,
          role: "tabpanel",
          "aria-labelledby": triggerId,
          hidden: !present,
          id: contentId,
          tabIndex: 0,
          ...contentProps,
          ref: forwardedRef,
          style: {
            ...props.style,
            animationDuration: isMountAnimationPreventedRef.current ? "0s" : void 0
          },
          children: present && children
        }
      ) });
    }, "TabsContent")
  );
  function makeTriggerId(baseId, value) {
    return `${baseId}-trigger-${value}`;
  }
  __name31(makeTriggerId, "makeTriggerId");
  function makeContentId(baseId, value) {
    return `${baseId}-content-${value}`;
  }
  __name31(makeContentId, "makeContentId");
  var Root24 = Tabs;
  var List = TabsList;
  var Trigger3 = TabsTrigger;
  var Content3 = TabsContent;

  // src/lib/utils.ts
  init_define_import_meta_env();

  // node_modules/.pnpm/tailwind-merge@3.6.0/node_modules/tailwind-merge/dist/bundle-mjs.mjs
  init_define_import_meta_env();
  var concatArrays = (array1, array2) => {
    const combinedArray = new Array(array1.length + array2.length);
    for (let i = 0; i < array1.length; i++) {
      combinedArray[i] = array1[i];
    }
    for (let i = 0; i < array2.length; i++) {
      combinedArray[array1.length + i] = array2[i];
    }
    return combinedArray;
  };
  var createClassValidatorObject = (classGroupId, validator) => ({
    classGroupId,
    validator
  });
  var createClassPartObject = (nextPart = /* @__PURE__ */ new Map(), validators = null, classGroupId) => ({
    nextPart,
    validators,
    classGroupId
  });
  var CLASS_PART_SEPARATOR = "-";
  var EMPTY_CONFLICTS = [];
  var ARBITRARY_PROPERTY_PREFIX = "arbitrary..";
  var createClassGroupUtils = (config) => {
    const classMap = createClassMap(config);
    const {
      conflictingClassGroups,
      conflictingClassGroupModifiers
    } = config;
    const getClassGroupId = (className) => {
      if (className.startsWith("[") && className.endsWith("]")) {
        return getGroupIdForArbitraryProperty(className);
      }
      const classParts = className.split(CLASS_PART_SEPARATOR);
      const startIndex = classParts[0] === "" && classParts.length > 1 ? 1 : 0;
      return getGroupRecursive(classParts, startIndex, classMap);
    };
    const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
      if (hasPostfixModifier) {
        const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
        const baseConflicts = conflictingClassGroups[classGroupId];
        if (modifierConflicts) {
          if (baseConflicts) {
            return concatArrays(baseConflicts, modifierConflicts);
          }
          return modifierConflicts;
        }
        return baseConflicts || EMPTY_CONFLICTS;
      }
      return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
    };
    return {
      getClassGroupId,
      getConflictingClassGroupIds
    };
  };
  var getGroupRecursive = (classParts, startIndex, classPartObject) => {
    const classPathsLength = classParts.length - startIndex;
    if (classPathsLength === 0) {
      return classPartObject.classGroupId;
    }
    const currentClassPart = classParts[startIndex];
    const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
    if (nextClassPartObject) {
      const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
      if (result) return result;
    }
    const validators = classPartObject.validators;
    if (validators === null) {
      return void 0;
    }
    const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
    const validatorsLength = validators.length;
    for (let i = 0; i < validatorsLength; i++) {
      const validatorObj = validators[i];
      if (validatorObj.validator(classRest)) {
        return validatorObj.classGroupId;
      }
    }
    return void 0;
  };
  var getGroupIdForArbitraryProperty = (className) => className.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
    const content = className.slice(1, -1);
    const colonIndex = content.indexOf(":");
    const property = content.slice(0, colonIndex);
    return property ? ARBITRARY_PROPERTY_PREFIX + property : void 0;
  })();
  var createClassMap = (config) => {
    const {
      theme,
      classGroups
    } = config;
    return processClassGroups(classGroups, theme);
  };
  var processClassGroups = (classGroups, theme) => {
    const classMap = createClassPartObject();
    for (const classGroupId in classGroups) {
      const group = classGroups[classGroupId];
      processClassesRecursively(group, classMap, classGroupId, theme);
    }
    return classMap;
  };
  var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
    const len = classGroup.length;
    for (let i = 0; i < len; i++) {
      const classDefinition = classGroup[i];
      processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
    }
  };
  var processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (typeof classDefinition === "string") {
      processStringDefinition(classDefinition, classPartObject, classGroupId);
      return;
    }
    if (typeof classDefinition === "function") {
      processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
      return;
    }
    processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
  };
  var processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
    const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
    classPartObjectToEdit.classGroupId = classGroupId;
  };
  var processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (isThemeGetter(classDefinition)) {
      processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
      return;
    }
    if (classPartObject.validators === null) {
      classPartObject.validators = [];
    }
    classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
  };
  var processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    const entries = Object.entries(classDefinition);
    const len = entries.length;
    for (let i = 0; i < len; i++) {
      const [key, value] = entries[i];
      processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
    }
  };
  var getPart = (classPartObject, path) => {
    let current = classPartObject;
    const parts = path.split(CLASS_PART_SEPARATOR);
    const len = parts.length;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      let next = current.nextPart.get(part);
      if (!next) {
        next = createClassPartObject();
        current.nextPart.set(part, next);
      }
      current = next;
    }
    return current;
  };
  var isThemeGetter = (func) => "isThemeGetter" in func && func.isThemeGetter === true;
  var createLruCache = (maxCacheSize) => {
    if (maxCacheSize < 1) {
      return {
        get: () => void 0,
        set: () => {
        }
      };
    }
    let cacheSize = 0;
    let cache = /* @__PURE__ */ Object.create(null);
    let previousCache = /* @__PURE__ */ Object.create(null);
    const update = (key, value) => {
      cache[key] = value;
      cacheSize++;
      if (cacheSize > maxCacheSize) {
        cacheSize = 0;
        previousCache = cache;
        cache = /* @__PURE__ */ Object.create(null);
      }
    };
    return {
      get(key) {
        let value = cache[key];
        if (value !== void 0) {
          return value;
        }
        if ((value = previousCache[key]) !== void 0) {
          update(key, value);
          return value;
        }
      },
      set(key, value) {
        if (key in cache) {
          cache[key] = value;
        } else {
          update(key, value);
        }
      }
    };
  };
  var IMPORTANT_MODIFIER = "!";
  var MODIFIER_SEPARATOR = ":";
  var EMPTY_MODIFIERS = [];
  var createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
    modifiers,
    hasImportantModifier,
    baseClassName,
    maybePostfixModifierPosition,
    isExternal
  });
  var createParseClassName = (config) => {
    const {
      prefix,
      experimentalParseClassName
    } = config;
    let parseClassName = (className) => {
      const modifiers = [];
      let bracketDepth = 0;
      let parenDepth = 0;
      let modifierStart = 0;
      let postfixModifierPosition;
      const len = className.length;
      for (let index2 = 0; index2 < len; index2++) {
        const currentCharacter = className[index2];
        if (bracketDepth === 0 && parenDepth === 0) {
          if (currentCharacter === MODIFIER_SEPARATOR) {
            modifiers.push(className.slice(modifierStart, index2));
            modifierStart = index2 + 1;
            continue;
          }
          if (currentCharacter === "/") {
            postfixModifierPosition = index2;
            continue;
          }
        }
        if (currentCharacter === "[") bracketDepth++;
        else if (currentCharacter === "]") bracketDepth--;
        else if (currentCharacter === "(") parenDepth++;
        else if (currentCharacter === ")") parenDepth--;
      }
      const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
      let baseClassName = baseClassNameWithImportantModifier;
      let hasImportantModifier = false;
      if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
        baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
        hasImportantModifier = true;
      } else if (
        /**
         * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
         * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
         */
        baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)
      ) {
        baseClassName = baseClassNameWithImportantModifier.slice(1);
        hasImportantModifier = true;
      }
      const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
      return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
    };
    if (prefix) {
      const fullPrefix = prefix + MODIFIER_SEPARATOR;
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, void 0, true);
    }
    if (experimentalParseClassName) {
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => experimentalParseClassName({
        className,
        parseClassName: parseClassNameOriginal
      });
    }
    return parseClassName;
  };
  var createSortModifiers = (config) => {
    const modifierWeights = /* @__PURE__ */ new Map();
    config.orderSensitiveModifiers.forEach((mod, index2) => {
      modifierWeights.set(mod, 1e6 + index2);
    });
    return (modifiers) => {
      const result = [];
      let currentSegment = [];
      for (let i = 0; i < modifiers.length; i++) {
        const modifier = modifiers[i];
        const isArbitrary = modifier[0] === "[";
        const isOrderSensitive = modifierWeights.has(modifier);
        if (isArbitrary || isOrderSensitive) {
          if (currentSegment.length > 0) {
            currentSegment.sort();
            result.push(...currentSegment);
            currentSegment = [];
          }
          result.push(modifier);
        } else {
          currentSegment.push(modifier);
        }
      }
      if (currentSegment.length > 0) {
        currentSegment.sort();
        result.push(...currentSegment);
      }
      return result;
    };
  };
  var createConfigUtils = (config) => ({
    cache: createLruCache(config.cacheSize),
    parseClassName: createParseClassName(config),
    sortModifiers: createSortModifiers(config),
    postfixLookupClassGroupIds: createPostfixLookupClassGroupIds(config),
    ...createClassGroupUtils(config)
  });
  var createPostfixLookupClassGroupIds = (config) => {
    const lookup = /* @__PURE__ */ Object.create(null);
    const classGroupIds = config.postfixLookupClassGroups;
    if (classGroupIds) {
      for (let i = 0; i < classGroupIds.length; i++) {
        lookup[classGroupIds[i]] = true;
      }
    }
    return lookup;
  };
  var SPLIT_CLASSES_REGEX = /\s+/;
  var mergeClassList = (classList, configUtils) => {
    const {
      parseClassName,
      getClassGroupId,
      getConflictingClassGroupIds,
      sortModifiers,
      postfixLookupClassGroupIds
    } = configUtils;
    const classGroupsInConflict = [];
    const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
    let result = "";
    for (let index2 = classNames.length - 1; index2 >= 0; index2 -= 1) {
      const originalClassName = classNames[index2];
      const {
        isExternal,
        modifiers,
        hasImportantModifier,
        baseClassName,
        maybePostfixModifierPosition
      } = parseClassName(originalClassName);
      if (isExternal) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      let hasPostfixModifier = !!maybePostfixModifierPosition;
      let classGroupId;
      if (hasPostfixModifier) {
        const baseClassNameWithoutPostfix = baseClassName.substring(0, maybePostfixModifierPosition);
        classGroupId = getClassGroupId(baseClassNameWithoutPostfix);
        const classGroupIdWithPostfix = classGroupId && postfixLookupClassGroupIds[classGroupId] ? getClassGroupId(baseClassName) : void 0;
        if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
          classGroupId = classGroupIdWithPostfix;
          hasPostfixModifier = false;
        }
      } else {
        classGroupId = getClassGroupId(baseClassName);
      }
      if (!classGroupId) {
        if (!hasPostfixModifier) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        classGroupId = getClassGroupId(baseClassName);
        if (!classGroupId) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        hasPostfixModifier = false;
      }
      const variantModifier = modifiers.length === 0 ? "" : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(":");
      const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
      const classId = modifierId + classGroupId;
      if (classGroupsInConflict.indexOf(classId) > -1) {
        continue;
      }
      classGroupsInConflict.push(classId);
      const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
      for (let i = 0; i < conflictGroups.length; ++i) {
        const group = conflictGroups[i];
        classGroupsInConflict.push(modifierId + group);
      }
      result = originalClassName + (result.length > 0 ? " " + result : result);
    }
    return result;
  };
  var twJoin = (...classLists) => {
    let index2 = 0;
    let argument;
    let resolvedValue;
    let string = "";
    while (index2 < classLists.length) {
      if (argument = classLists[index2++]) {
        if (resolvedValue = toValue(argument)) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var toValue = (mix) => {
    if (typeof mix === "string") {
      return mix;
    }
    let resolvedValue;
    let string = "";
    for (let k = 0; k < mix.length; k++) {
      if (mix[k]) {
        if (resolvedValue = toValue(mix[k])) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
    let configUtils;
    let cacheGet;
    let cacheSet;
    let functionToCall;
    const initTailwindMerge = (classList) => {
      const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
      configUtils = createConfigUtils(config);
      cacheGet = configUtils.cache.get;
      cacheSet = configUtils.cache.set;
      functionToCall = tailwindMerge;
      return tailwindMerge(classList);
    };
    const tailwindMerge = (classList) => {
      const cachedResult = cacheGet(classList);
      if (cachedResult) {
        return cachedResult;
      }
      const result = mergeClassList(classList, configUtils);
      cacheSet(classList, result);
      return result;
    };
    functionToCall = initTailwindMerge;
    return (...args) => functionToCall(twJoin(...args));
  };
  var fallbackThemeArr = [];
  var fromTheme = (key) => {
    const themeGetter = (theme) => theme[key] || fallbackThemeArr;
    themeGetter.isThemeGetter = true;
    return themeGetter;
  };
  var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
  var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
  var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
  var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
  var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
  var isFraction = (value) => fractionRegex.test(value);
  var isNumber = (value) => !!value && !Number.isNaN(Number(value));
  var isInteger = (value) => !!value && Number.isInteger(Number(value));
  var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
  var isTshirtSize = (value) => tshirtUnitRegex.test(value);
  var isAny = () => true;
  var isLengthOnly = (value) => (
    // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
    // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
    // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
    lengthUnitRegex.test(value) && !colorFunctionRegex.test(value)
  );
  var isNever = () => false;
  var isShadow = (value) => shadowRegex.test(value);
  var isImage = (value) => imageRegex.test(value);
  var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
  var isNamedContainerQuery = (value) => value.startsWith("@container") && (value[10] === "/" && value[11] !== void 0 || value[11] === "s" && value[16] !== void 0 && value.startsWith("-size/", 10) || value[11] === "n" && value[18] !== void 0 && value.startsWith("-normal/", 10));
  var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
  var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
  var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
  var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
  var isArbitraryWeight = (value) => getIsArbitraryValue(value, isLabelWeight, isAny);
  var isArbitraryFamilyName = (value) => getIsArbitraryValue(value, isLabelFamilyName, isNever);
  var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
  var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
  var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
  var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
  var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
  var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
  var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
  var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
  var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
  var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
  var isArbitraryVariableWeight = (value) => getIsArbitraryVariable(value, isLabelWeight, true);
  var getIsArbitraryValue = (value, testLabel, testValue) => {
    const result = arbitraryValueRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return testValue(result[2]);
    }
    return false;
  };
  var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
    const result = arbitraryVariableRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return shouldMatchNoLabel;
    }
    return false;
  };
  var isLabelPosition = (label) => label === "position" || label === "percentage";
  var isLabelImage = (label) => label === "image" || label === "url";
  var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
  var isLabelLength = (label) => label === "length";
  var isLabelNumber = (label) => label === "number";
  var isLabelFamilyName = (label) => label === "family-name";
  var isLabelWeight = (label) => label === "number" || label === "weight";
  var isLabelShadow = (label) => label === "shadow";
  var getDefaultConfig = () => {
    const themeColor = fromTheme("color");
    const themeFont = fromTheme("font");
    const themeText = fromTheme("text");
    const themeFontWeight = fromTheme("font-weight");
    const themeTracking = fromTheme("tracking");
    const themeLeading = fromTheme("leading");
    const themeBreakpoint = fromTheme("breakpoint");
    const themeContainer = fromTheme("container");
    const themeSpacing = fromTheme("spacing");
    const themeRadius = fromTheme("radius");
    const themeShadow = fromTheme("shadow");
    const themeInsetShadow = fromTheme("inset-shadow");
    const themeTextShadow = fromTheme("text-shadow");
    const themeDropShadow = fromTheme("drop-shadow");
    const themeBlur = fromTheme("blur");
    const themePerspective = fromTheme("perspective");
    const themeAspect = fromTheme("aspect");
    const themeEase = fromTheme("ease");
    const themeAnimate = fromTheme("animate");
    const scaleBreak = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
    const scalePosition = () => [
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-top",
      "top-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-top",
      "bottom-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-bottom",
      "bottom-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-bottom"
    ];
    const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
    const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
    const scaleOverscroll = () => ["auto", "contain", "none"];
    const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
    const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
    const scaleGridTemplateColsRows = () => [isInteger, "none", "subgrid", isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartAndEnd = () => ["auto", {
      span: ["full", isInteger, isArbitraryVariable, isArbitraryValue]
    }, isInteger, isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartOrEnd = () => [isInteger, "auto", isArbitraryVariable, isArbitraryValue];
    const scaleGridAutoColsRows = () => ["auto", "min", "max", "fr", isArbitraryVariable, isArbitraryValue];
    const scaleAlignPrimaryAxis = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"];
    const scaleAlignSecondaryAxis = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"];
    const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
    const scaleSizing = () => [isFraction, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingInline = () => [isFraction, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingBlock = () => [isFraction, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
    const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
      position: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleBgRepeat = () => ["no-repeat", {
      repeat: ["", "x", "y", "space", "round"]
    }];
    const scaleBgSize = () => ["auto", "cover", "contain", isArbitraryVariableSize, isArbitrarySize, {
      size: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
    const scaleRadius = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      "full",
      themeRadius,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
    const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
    const scaleBlendMode = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
    const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
    const scaleBlur = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      themeBlur,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
    return {
      cacheSize: 500,
      theme: {
        animate: ["spin", "ping", "pulse", "bounce"],
        aspect: ["video"],
        blur: [isTshirtSize],
        breakpoint: [isTshirtSize],
        color: [isAny],
        container: [isTshirtSize],
        "drop-shadow": [isTshirtSize],
        ease: ["in", "out", "in-out"],
        font: [isAnyNonArbitrary],
        "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
        "inset-shadow": [isTshirtSize],
        leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
        perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
        radius: [isTshirtSize],
        shadow: [isTshirtSize],
        spacing: ["px", isNumber],
        text: [isTshirtSize],
        "text-shadow": [isTshirtSize],
        tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
      },
      classGroups: {
        // --------------
        // --- Layout ---
        // --------------
        /**
         * Aspect Ratio
         * @see https://tailwindcss.com/docs/aspect-ratio
         */
        aspect: [{
          aspect: ["auto", "square", isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
        }],
        /**
         * Container
         * @see https://tailwindcss.com/docs/container
         * @deprecated since Tailwind CSS v4.0.0
         */
        container: ["container"],
        /**
         * Container Type
         * @see https://tailwindcss.com/docs/responsive-design#container-queries
         */
        "container-type": [{
          "@container": ["", "normal", "size", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Container Name
         * @see https://tailwindcss.com/docs/responsive-design#named-containers
         */
        "container-named": [isNamedContainerQuery],
        /**
         * Columns
         * @see https://tailwindcss.com/docs/columns
         */
        columns: [{
          columns: [isNumber, isArbitraryValue, isArbitraryVariable, themeContainer]
        }],
        /**
         * Break After
         * @see https://tailwindcss.com/docs/break-after
         */
        "break-after": [{
          "break-after": scaleBreak()
        }],
        /**
         * Break Before
         * @see https://tailwindcss.com/docs/break-before
         */
        "break-before": [{
          "break-before": scaleBreak()
        }],
        /**
         * Break Inside
         * @see https://tailwindcss.com/docs/break-inside
         */
        "break-inside": [{
          "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
        }],
        /**
         * Box Decoration Break
         * @see https://tailwindcss.com/docs/box-decoration-break
         */
        "box-decoration": [{
          "box-decoration": ["slice", "clone"]
        }],
        /**
         * Box Sizing
         * @see https://tailwindcss.com/docs/box-sizing
         */
        box: [{
          box: ["border", "content"]
        }],
        /**
         * Display
         * @see https://tailwindcss.com/docs/display
         */
        display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
        /**
         * Screen Reader Only
         * @see https://tailwindcss.com/docs/display#screen-reader-only
         */
        sr: ["sr-only", "not-sr-only"],
        /**
         * Floats
         * @see https://tailwindcss.com/docs/float
         */
        float: [{
          float: ["right", "left", "none", "start", "end"]
        }],
        /**
         * Clear
         * @see https://tailwindcss.com/docs/clear
         */
        clear: [{
          clear: ["left", "right", "both", "none", "start", "end"]
        }],
        /**
         * Isolation
         * @see https://tailwindcss.com/docs/isolation
         */
        isolation: ["isolate", "isolation-auto"],
        /**
         * Object Fit
         * @see https://tailwindcss.com/docs/object-fit
         */
        "object-fit": [{
          object: ["contain", "cover", "fill", "none", "scale-down"]
        }],
        /**
         * Object Position
         * @see https://tailwindcss.com/docs/object-position
         */
        "object-position": [{
          object: scalePositionWithArbitrary()
        }],
        /**
         * Overflow
         * @see https://tailwindcss.com/docs/overflow
         */
        overflow: [{
          overflow: scaleOverflow()
        }],
        /**
         * Overflow X
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-x": [{
          "overflow-x": scaleOverflow()
        }],
        /**
         * Overflow Y
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-y": [{
          "overflow-y": scaleOverflow()
        }],
        /**
         * Overscroll Behavior
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        overscroll: [{
          overscroll: scaleOverscroll()
        }],
        /**
         * Overscroll Behavior X
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-x": [{
          "overscroll-x": scaleOverscroll()
        }],
        /**
         * Overscroll Behavior Y
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-y": [{
          "overscroll-y": scaleOverscroll()
        }],
        /**
         * Position
         * @see https://tailwindcss.com/docs/position
         */
        position: ["static", "fixed", "absolute", "relative", "sticky"],
        /**
         * Inset
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        inset: [{
          inset: scaleInset()
        }],
        /**
         * Inset Inline
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-x": [{
          "inset-x": scaleInset()
        }],
        /**
         * Inset Block
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-y": [{
          "inset-y": scaleInset()
        }],
        /**
         * Inset Inline Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-s` in next major release
         */
        start: [{
          "inset-s": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          start: scaleInset()
        }],
        /**
         * Inset Inline End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-e` in next major release
         */
        end: [{
          "inset-e": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          end: scaleInset()
        }],
        /**
         * Inset Block Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-bs": [{
          "inset-bs": scaleInset()
        }],
        /**
         * Inset Block End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-be": [{
          "inset-be": scaleInset()
        }],
        /**
         * Top
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        top: [{
          top: scaleInset()
        }],
        /**
         * Right
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        right: [{
          right: scaleInset()
        }],
        /**
         * Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        bottom: [{
          bottom: scaleInset()
        }],
        /**
         * Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        left: [{
          left: scaleInset()
        }],
        /**
         * Visibility
         * @see https://tailwindcss.com/docs/visibility
         */
        visibility: ["visible", "invisible", "collapse"],
        /**
         * Z-Index
         * @see https://tailwindcss.com/docs/z-index
         */
        z: [{
          z: [isInteger, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------------
        // --- Flexbox and Grid ---
        // ------------------------
        /**
         * Flex Basis
         * @see https://tailwindcss.com/docs/flex-basis
         */
        basis: [{
          basis: [isFraction, "full", "auto", themeContainer, ...scaleUnambiguousSpacing()]
        }],
        /**
         * Flex Direction
         * @see https://tailwindcss.com/docs/flex-direction
         */
        "flex-direction": [{
          flex: ["row", "row-reverse", "col", "col-reverse"]
        }],
        /**
         * Flex Wrap
         * @see https://tailwindcss.com/docs/flex-wrap
         */
        "flex-wrap": [{
          flex: ["nowrap", "wrap", "wrap-reverse"]
        }],
        /**
         * Flex
         * @see https://tailwindcss.com/docs/flex
         */
        flex: [{
          flex: [isNumber, isFraction, "auto", "initial", "none", isArbitraryValue]
        }],
        /**
         * Flex Grow
         * @see https://tailwindcss.com/docs/flex-grow
         */
        grow: [{
          grow: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Flex Shrink
         * @see https://tailwindcss.com/docs/flex-shrink
         */
        shrink: [{
          shrink: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Order
         * @see https://tailwindcss.com/docs/order
         */
        order: [{
          order: [isInteger, "first", "last", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Grid Template Columns
         * @see https://tailwindcss.com/docs/grid-template-columns
         */
        "grid-cols": [{
          "grid-cols": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Column Start / End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start-end": [{
          col: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Column Start
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start": [{
          "col-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Column End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-end": [{
          "col-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Template Rows
         * @see https://tailwindcss.com/docs/grid-template-rows
         */
        "grid-rows": [{
          "grid-rows": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Row Start / End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start-end": [{
          row: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Row Start
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start": [{
          "row-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Row End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-end": [{
          "row-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Auto Flow
         * @see https://tailwindcss.com/docs/grid-auto-flow
         */
        "grid-flow": [{
          "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
        }],
        /**
         * Grid Auto Columns
         * @see https://tailwindcss.com/docs/grid-auto-columns
         */
        "auto-cols": [{
          "auto-cols": scaleGridAutoColsRows()
        }],
        /**
         * Grid Auto Rows
         * @see https://tailwindcss.com/docs/grid-auto-rows
         */
        "auto-rows": [{
          "auto-rows": scaleGridAutoColsRows()
        }],
        /**
         * Gap
         * @see https://tailwindcss.com/docs/gap
         */
        gap: [{
          gap: scaleUnambiguousSpacing()
        }],
        /**
         * Gap X
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-x": [{
          "gap-x": scaleUnambiguousSpacing()
        }],
        /**
         * Gap Y
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-y": [{
          "gap-y": scaleUnambiguousSpacing()
        }],
        /**
         * Justify Content
         * @see https://tailwindcss.com/docs/justify-content
         */
        "justify-content": [{
          justify: [...scaleAlignPrimaryAxis(), "normal"]
        }],
        /**
         * Justify Items
         * @see https://tailwindcss.com/docs/justify-items
         */
        "justify-items": [{
          "justify-items": [...scaleAlignSecondaryAxis(), "normal"]
        }],
        /**
         * Justify Self
         * @see https://tailwindcss.com/docs/justify-self
         */
        "justify-self": [{
          "justify-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        /**
         * Align Content
         * @see https://tailwindcss.com/docs/align-content
         */
        "align-content": [{
          content: ["normal", ...scaleAlignPrimaryAxis()]
        }],
        /**
         * Align Items
         * @see https://tailwindcss.com/docs/align-items
         */
        "align-items": [{
          items: [...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Align Self
         * @see https://tailwindcss.com/docs/align-self
         */
        "align-self": [{
          self: ["auto", ...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Place Content
         * @see https://tailwindcss.com/docs/place-content
         */
        "place-content": [{
          "place-content": scaleAlignPrimaryAxis()
        }],
        /**
         * Place Items
         * @see https://tailwindcss.com/docs/place-items
         */
        "place-items": [{
          "place-items": [...scaleAlignSecondaryAxis(), "baseline"]
        }],
        /**
         * Place Self
         * @see https://tailwindcss.com/docs/place-self
         */
        "place-self": [{
          "place-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        // Spacing
        /**
         * Padding
         * @see https://tailwindcss.com/docs/padding
         */
        p: [{
          p: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline
         * @see https://tailwindcss.com/docs/padding
         */
        px: [{
          px: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block
         * @see https://tailwindcss.com/docs/padding
         */
        py: [{
          py: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline Start
         * @see https://tailwindcss.com/docs/padding
         */
        ps: [{
          ps: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline End
         * @see https://tailwindcss.com/docs/padding
         */
        pe: [{
          pe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block Start
         * @see https://tailwindcss.com/docs/padding
         */
        pbs: [{
          pbs: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block End
         * @see https://tailwindcss.com/docs/padding
         */
        pbe: [{
          pbe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Top
         * @see https://tailwindcss.com/docs/padding
         */
        pt: [{
          pt: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Right
         * @see https://tailwindcss.com/docs/padding
         */
        pr: [{
          pr: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Bottom
         * @see https://tailwindcss.com/docs/padding
         */
        pb: [{
          pb: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Left
         * @see https://tailwindcss.com/docs/padding
         */
        pl: [{
          pl: scaleUnambiguousSpacing()
        }],
        /**
         * Margin
         * @see https://tailwindcss.com/docs/margin
         */
        m: [{
          m: scaleMargin()
        }],
        /**
         * Margin Inline
         * @see https://tailwindcss.com/docs/margin
         */
        mx: [{
          mx: scaleMargin()
        }],
        /**
         * Margin Block
         * @see https://tailwindcss.com/docs/margin
         */
        my: [{
          my: scaleMargin()
        }],
        /**
         * Margin Inline Start
         * @see https://tailwindcss.com/docs/margin
         */
        ms: [{
          ms: scaleMargin()
        }],
        /**
         * Margin Inline End
         * @see https://tailwindcss.com/docs/margin
         */
        me: [{
          me: scaleMargin()
        }],
        /**
         * Margin Block Start
         * @see https://tailwindcss.com/docs/margin
         */
        mbs: [{
          mbs: scaleMargin()
        }],
        /**
         * Margin Block End
         * @see https://tailwindcss.com/docs/margin
         */
        mbe: [{
          mbe: scaleMargin()
        }],
        /**
         * Margin Top
         * @see https://tailwindcss.com/docs/margin
         */
        mt: [{
          mt: scaleMargin()
        }],
        /**
         * Margin Right
         * @see https://tailwindcss.com/docs/margin
         */
        mr: [{
          mr: scaleMargin()
        }],
        /**
         * Margin Bottom
         * @see https://tailwindcss.com/docs/margin
         */
        mb: [{
          mb: scaleMargin()
        }],
        /**
         * Margin Left
         * @see https://tailwindcss.com/docs/margin
         */
        ml: [{
          ml: scaleMargin()
        }],
        /**
         * Space Between X
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x": [{
          "space-x": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between X Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x-reverse": ["space-x-reverse"],
        /**
         * Space Between Y
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y": [{
          "space-y": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between Y Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y-reverse": ["space-y-reverse"],
        // --------------
        // --- Sizing ---
        // --------------
        /**
         * Size
         * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
         */
        size: [{
          size: scaleSizing()
        }],
        /**
         * Inline Size
         * @see https://tailwindcss.com/docs/width
         */
        "inline-size": [{
          inline: ["auto", ...scaleSizingInline()]
        }],
        /**
         * Min-Inline Size
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-inline-size": [{
          "min-inline": ["auto", ...scaleSizingInline()]
        }],
        /**
         * Max-Inline Size
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-inline-size": [{
          "max-inline": ["none", ...scaleSizingInline()]
        }],
        /**
         * Block Size
         * @see https://tailwindcss.com/docs/height
         */
        "block-size": [{
          block: ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Min-Block Size
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-block-size": [{
          "min-block": ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Max-Block Size
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-block-size": [{
          "max-block": ["none", ...scaleSizingBlock()]
        }],
        /**
         * Width
         * @see https://tailwindcss.com/docs/width
         */
        w: [{
          w: [themeContainer, "screen", ...scaleSizing()]
        }],
        /**
         * Min-Width
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-w": [{
          "min-w": [
            themeContainer,
            "screen",
            /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "none",
            ...scaleSizing()
          ]
        }],
        /**
         * Max-Width
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-w": [{
          "max-w": [
            themeContainer,
            "screen",
            "none",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "prose",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            {
              screen: [themeBreakpoint]
            },
            ...scaleSizing()
          ]
        }],
        /**
         * Height
         * @see https://tailwindcss.com/docs/height
         */
        h: [{
          h: ["screen", "lh", ...scaleSizing()]
        }],
        /**
         * Min-Height
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-h": [{
          "min-h": ["screen", "lh", "none", ...scaleSizing()]
        }],
        /**
         * Max-Height
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-h": [{
          "max-h": ["screen", "lh", ...scaleSizing()]
        }],
        // ------------------
        // --- Typography ---
        // ------------------
        /**
         * Font Size
         * @see https://tailwindcss.com/docs/font-size
         */
        "font-size": [{
          text: ["base", themeText, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Font Smoothing
         * @see https://tailwindcss.com/docs/font-smoothing
         */
        "font-smoothing": ["antialiased", "subpixel-antialiased"],
        /**
         * Font Style
         * @see https://tailwindcss.com/docs/font-style
         */
        "font-style": ["italic", "not-italic"],
        /**
         * Font Weight
         * @see https://tailwindcss.com/docs/font-weight
         */
        "font-weight": [{
          font: [themeFontWeight, isArbitraryVariableWeight, isArbitraryWeight]
        }],
        /**
         * Font Stretch
         * @see https://tailwindcss.com/docs/font-stretch
         */
        "font-stretch": [{
          "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", isPercent, isArbitraryValue]
        }],
        /**
         * Font Family
         * @see https://tailwindcss.com/docs/font-family
         */
        "font-family": [{
          font: [isArbitraryVariableFamilyName, isArbitraryFamilyName, themeFont]
        }],
        /**
         * Font Feature Settings
         * @see https://tailwindcss.com/docs/font-feature-settings
         */
        "font-features": [{
          "font-features": [isArbitraryValue]
        }],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-normal": ["normal-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-ordinal": ["ordinal"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-slashed-zero": ["slashed-zero"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-figure": ["lining-nums", "oldstyle-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-spacing": ["proportional-nums", "tabular-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
        /**
         * Letter Spacing
         * @see https://tailwindcss.com/docs/letter-spacing
         */
        tracking: [{
          tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Line Clamp
         * @see https://tailwindcss.com/docs/line-clamp
         */
        "line-clamp": [{
          "line-clamp": [isNumber, "none", isArbitraryVariable, isArbitraryNumber]
        }],
        /**
         * Line Height
         * @see https://tailwindcss.com/docs/line-height
         */
        leading: [{
          leading: [
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            themeLeading,
            ...scaleUnambiguousSpacing()
          ]
        }],
        /**
         * List Style Image
         * @see https://tailwindcss.com/docs/list-style-image
         */
        "list-image": [{
          "list-image": ["none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * List Style Position
         * @see https://tailwindcss.com/docs/list-style-position
         */
        "list-style-position": [{
          list: ["inside", "outside"]
        }],
        /**
         * List Style Type
         * @see https://tailwindcss.com/docs/list-style-type
         */
        "list-style-type": [{
          list: ["disc", "decimal", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Alignment
         * @see https://tailwindcss.com/docs/text-align
         */
        "text-alignment": [{
          text: ["left", "center", "right", "justify", "start", "end"]
        }],
        /**
         * Placeholder Color
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://v3.tailwindcss.com/docs/placeholder-color
         */
        "placeholder-color": [{
          placeholder: scaleColor()
        }],
        /**
         * Text Color
         * @see https://tailwindcss.com/docs/text-color
         */
        "text-color": [{
          text: scaleColor()
        }],
        /**
         * Text Decoration
         * @see https://tailwindcss.com/docs/text-decoration
         */
        "text-decoration": ["underline", "overline", "line-through", "no-underline"],
        /**
         * Text Decoration Style
         * @see https://tailwindcss.com/docs/text-decoration-style
         */
        "text-decoration-style": [{
          decoration: [...scaleLineStyle(), "wavy"]
        }],
        /**
         * Text Decoration Thickness
         * @see https://tailwindcss.com/docs/text-decoration-thickness
         */
        "text-decoration-thickness": [{
          decoration: [isNumber, "from-font", "auto", isArbitraryVariable, isArbitraryLength]
        }],
        /**
         * Text Decoration Color
         * @see https://tailwindcss.com/docs/text-decoration-color
         */
        "text-decoration-color": [{
          decoration: scaleColor()
        }],
        /**
         * Text Underline Offset
         * @see https://tailwindcss.com/docs/text-underline-offset
         */
        "underline-offset": [{
          "underline-offset": [isNumber, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Transform
         * @see https://tailwindcss.com/docs/text-transform
         */
        "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
        /**
         * Text Overflow
         * @see https://tailwindcss.com/docs/text-overflow
         */
        "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
        /**
         * Text Wrap
         * @see https://tailwindcss.com/docs/text-wrap
         */
        "text-wrap": [{
          text: ["wrap", "nowrap", "balance", "pretty"]
        }],
        /**
         * Text Indent
         * @see https://tailwindcss.com/docs/text-indent
         */
        indent: [{
          indent: scaleUnambiguousSpacing()
        }],
        /**
         * Tab Size
         * @see https://tailwindcss.com/docs/tab-size
         */
        "tab-size": [{
          tab: [isInteger, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Vertical Alignment
         * @see https://tailwindcss.com/docs/vertical-align
         */
        "vertical-align": [{
          align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Whitespace
         * @see https://tailwindcss.com/docs/whitespace
         */
        whitespace: [{
          whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
        }],
        /**
         * Word Break
         * @see https://tailwindcss.com/docs/word-break
         */
        break: [{
          break: ["normal", "words", "all", "keep"]
        }],
        /**
         * Overflow Wrap
         * @see https://tailwindcss.com/docs/overflow-wrap
         */
        wrap: [{
          wrap: ["break-word", "anywhere", "normal"]
        }],
        /**
         * Hyphens
         * @see https://tailwindcss.com/docs/hyphens
         */
        hyphens: [{
          hyphens: ["none", "manual", "auto"]
        }],
        /**
         * Content
         * @see https://tailwindcss.com/docs/content
         */
        content: [{
          content: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // -------------------
        // --- Backgrounds ---
        // -------------------
        /**
         * Background Attachment
         * @see https://tailwindcss.com/docs/background-attachment
         */
        "bg-attachment": [{
          bg: ["fixed", "local", "scroll"]
        }],
        /**
         * Background Clip
         * @see https://tailwindcss.com/docs/background-clip
         */
        "bg-clip": [{
          "bg-clip": ["border", "padding", "content", "text"]
        }],
        /**
         * Background Origin
         * @see https://tailwindcss.com/docs/background-origin
         */
        "bg-origin": [{
          "bg-origin": ["border", "padding", "content"]
        }],
        /**
         * Background Position
         * @see https://tailwindcss.com/docs/background-position
         */
        "bg-position": [{
          bg: scaleBgPosition()
        }],
        /**
         * Background Repeat
         * @see https://tailwindcss.com/docs/background-repeat
         */
        "bg-repeat": [{
          bg: scaleBgRepeat()
        }],
        /**
         * Background Size
         * @see https://tailwindcss.com/docs/background-size
         */
        "bg-size": [{
          bg: scaleBgSize()
        }],
        /**
         * Background Image
         * @see https://tailwindcss.com/docs/background-image
         */
        "bg-image": [{
          bg: ["none", {
            linear: [{
              to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
            }, isInteger, isArbitraryVariable, isArbitraryValue],
            radial: ["", isArbitraryVariable, isArbitraryValue],
            conic: [isInteger, isArbitraryVariable, isArbitraryValue]
          }, isArbitraryVariableImage, isArbitraryImage]
        }],
        /**
         * Background Color
         * @see https://tailwindcss.com/docs/background-color
         */
        "bg-color": [{
          bg: scaleColor()
        }],
        /**
         * Gradient Color Stops From Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from-pos": [{
          from: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops Via Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via-pos": [{
          via: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops To Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to-pos": [{
          to: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops From
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from": [{
          from: scaleColor()
        }],
        /**
         * Gradient Color Stops Via
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via": [{
          via: scaleColor()
        }],
        /**
         * Gradient Color Stops To
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to": [{
          to: scaleColor()
        }],
        // ---------------
        // --- Borders ---
        // ---------------
        /**
         * Border Radius
         * @see https://tailwindcss.com/docs/border-radius
         */
        rounded: [{
          rounded: scaleRadius()
        }],
        /**
         * Border Radius Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-s": [{
          "rounded-s": scaleRadius()
        }],
        /**
         * Border Radius End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-e": [{
          "rounded-e": scaleRadius()
        }],
        /**
         * Border Radius Top
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-t": [{
          "rounded-t": scaleRadius()
        }],
        /**
         * Border Radius Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-r": [{
          "rounded-r": scaleRadius()
        }],
        /**
         * Border Radius Bottom
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-b": [{
          "rounded-b": scaleRadius()
        }],
        /**
         * Border Radius Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-l": [{
          "rounded-l": scaleRadius()
        }],
        /**
         * Border Radius Start Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ss": [{
          "rounded-ss": scaleRadius()
        }],
        /**
         * Border Radius Start End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-se": [{
          "rounded-se": scaleRadius()
        }],
        /**
         * Border Radius End End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ee": [{
          "rounded-ee": scaleRadius()
        }],
        /**
         * Border Radius End Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-es": [{
          "rounded-es": scaleRadius()
        }],
        /**
         * Border Radius Top Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tl": [{
          "rounded-tl": scaleRadius()
        }],
        /**
         * Border Radius Top Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tr": [{
          "rounded-tr": scaleRadius()
        }],
        /**
         * Border Radius Bottom Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-br": [{
          "rounded-br": scaleRadius()
        }],
        /**
         * Border Radius Bottom Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-bl": [{
          "rounded-bl": scaleRadius()
        }],
        /**
         * Border Width
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w": [{
          border: scaleBorderWidth()
        }],
        /**
         * Border Width Inline
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-x": [{
          "border-x": scaleBorderWidth()
        }],
        /**
         * Border Width Block
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-y": [{
          "border-y": scaleBorderWidth()
        }],
        /**
         * Border Width Inline Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-s": [{
          "border-s": scaleBorderWidth()
        }],
        /**
         * Border Width Inline End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-e": [{
          "border-e": scaleBorderWidth()
        }],
        /**
         * Border Width Block Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-bs": [{
          "border-bs": scaleBorderWidth()
        }],
        /**
         * Border Width Block End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-be": [{
          "border-be": scaleBorderWidth()
        }],
        /**
         * Border Width Top
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-t": [{
          "border-t": scaleBorderWidth()
        }],
        /**
         * Border Width Right
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-r": [{
          "border-r": scaleBorderWidth()
        }],
        /**
         * Border Width Bottom
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-b": [{
          "border-b": scaleBorderWidth()
        }],
        /**
         * Border Width Left
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-l": [{
          "border-l": scaleBorderWidth()
        }],
        /**
         * Divide Width X
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x": [{
          "divide-x": scaleBorderWidth()
        }],
        /**
         * Divide Width X Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x-reverse": ["divide-x-reverse"],
        /**
         * Divide Width Y
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y": [{
          "divide-y": scaleBorderWidth()
        }],
        /**
         * Divide Width Y Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y-reverse": ["divide-y-reverse"],
        /**
         * Border Style
         * @see https://tailwindcss.com/docs/border-style
         */
        "border-style": [{
          border: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Divide Style
         * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
         */
        "divide-style": [{
          divide: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Border Color
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color": [{
          border: scaleColor()
        }],
        /**
         * Border Color Inline
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-x": [{
          "border-x": scaleColor()
        }],
        /**
         * Border Color Block
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-y": [{
          "border-y": scaleColor()
        }],
        /**
         * Border Color Inline Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-s": [{
          "border-s": scaleColor()
        }],
        /**
         * Border Color Inline End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-e": [{
          "border-e": scaleColor()
        }],
        /**
         * Border Color Block Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-bs": [{
          "border-bs": scaleColor()
        }],
        /**
         * Border Color Block End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-be": [{
          "border-be": scaleColor()
        }],
        /**
         * Border Color Top
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-t": [{
          "border-t": scaleColor()
        }],
        /**
         * Border Color Right
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-r": [{
          "border-r": scaleColor()
        }],
        /**
         * Border Color Bottom
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-b": [{
          "border-b": scaleColor()
        }],
        /**
         * Border Color Left
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-l": [{
          "border-l": scaleColor()
        }],
        /**
         * Divide Color
         * @see https://tailwindcss.com/docs/divide-color
         */
        "divide-color": [{
          divide: scaleColor()
        }],
        /**
         * Outline Style
         * @see https://tailwindcss.com/docs/outline-style
         */
        "outline-style": [{
          outline: [...scaleLineStyle(), "none", "hidden"]
        }],
        /**
         * Outline Offset
         * @see https://tailwindcss.com/docs/outline-offset
         */
        "outline-offset": [{
          "outline-offset": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Outline Width
         * @see https://tailwindcss.com/docs/outline-width
         */
        "outline-w": [{
          outline: ["", isNumber, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Outline Color
         * @see https://tailwindcss.com/docs/outline-color
         */
        "outline-color": [{
          outline: scaleColor()
        }],
        // ---------------
        // --- Effects ---
        // ---------------
        /**
         * Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow
         */
        shadow: [{
          shadow: [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
         */
        "shadow-color": [{
          shadow: scaleColor()
        }],
        /**
         * Inset Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
         */
        "inset-shadow": [{
          "inset-shadow": ["none", themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Inset Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
         */
        "inset-shadow-color": [{
          "inset-shadow": scaleColor()
        }],
        /**
         * Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
         */
        "ring-w": [{
          ring: scaleBorderWidth()
        }],
        /**
         * Ring Width Inset
         * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-w-inset": ["ring-inset"],
        /**
         * Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
         */
        "ring-color": [{
          ring: scaleColor()
        }],
        /**
         * Ring Offset Width
         * @see https://v3.tailwindcss.com/docs/ring-offset-width
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-w": [{
          "ring-offset": [isNumber, isArbitraryLength]
        }],
        /**
         * Ring Offset Color
         * @see https://v3.tailwindcss.com/docs/ring-offset-color
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-color": [{
          "ring-offset": scaleColor()
        }],
        /**
         * Inset Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
         */
        "inset-ring-w": [{
          "inset-ring": scaleBorderWidth()
        }],
        /**
         * Inset Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
         */
        "inset-ring-color": [{
          "inset-ring": scaleColor()
        }],
        /**
         * Text Shadow
         * @see https://tailwindcss.com/docs/text-shadow
         */
        "text-shadow": [{
          "text-shadow": ["none", themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Text Shadow Color
         * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
         */
        "text-shadow-color": [{
          "text-shadow": scaleColor()
        }],
        /**
         * Opacity
         * @see https://tailwindcss.com/docs/opacity
         */
        opacity: [{
          opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Mix Blend Mode
         * @see https://tailwindcss.com/docs/mix-blend-mode
         */
        "mix-blend": [{
          "mix-blend": [...scaleBlendMode(), "plus-darker", "plus-lighter"]
        }],
        /**
         * Background Blend Mode
         * @see https://tailwindcss.com/docs/background-blend-mode
         */
        "bg-blend": [{
          "bg-blend": scaleBlendMode()
        }],
        /**
         * Mask Clip
         * @see https://tailwindcss.com/docs/mask-clip
         */
        "mask-clip": [{
          "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
        }, "mask-no-clip"],
        /**
         * Mask Composite
         * @see https://tailwindcss.com/docs/mask-composite
         */
        "mask-composite": [{
          mask: ["add", "subtract", "intersect", "exclude"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image-linear-pos": [{
          "mask-linear": [isNumber]
        }],
        "mask-image-linear-from-pos": [{
          "mask-linear-from": scaleMaskImagePosition()
        }],
        "mask-image-linear-to-pos": [{
          "mask-linear-to": scaleMaskImagePosition()
        }],
        "mask-image-linear-from-color": [{
          "mask-linear-from": scaleColor()
        }],
        "mask-image-linear-to-color": [{
          "mask-linear-to": scaleColor()
        }],
        "mask-image-t-from-pos": [{
          "mask-t-from": scaleMaskImagePosition()
        }],
        "mask-image-t-to-pos": [{
          "mask-t-to": scaleMaskImagePosition()
        }],
        "mask-image-t-from-color": [{
          "mask-t-from": scaleColor()
        }],
        "mask-image-t-to-color": [{
          "mask-t-to": scaleColor()
        }],
        "mask-image-r-from-pos": [{
          "mask-r-from": scaleMaskImagePosition()
        }],
        "mask-image-r-to-pos": [{
          "mask-r-to": scaleMaskImagePosition()
        }],
        "mask-image-r-from-color": [{
          "mask-r-from": scaleColor()
        }],
        "mask-image-r-to-color": [{
          "mask-r-to": scaleColor()
        }],
        "mask-image-b-from-pos": [{
          "mask-b-from": scaleMaskImagePosition()
        }],
        "mask-image-b-to-pos": [{
          "mask-b-to": scaleMaskImagePosition()
        }],
        "mask-image-b-from-color": [{
          "mask-b-from": scaleColor()
        }],
        "mask-image-b-to-color": [{
          "mask-b-to": scaleColor()
        }],
        "mask-image-l-from-pos": [{
          "mask-l-from": scaleMaskImagePosition()
        }],
        "mask-image-l-to-pos": [{
          "mask-l-to": scaleMaskImagePosition()
        }],
        "mask-image-l-from-color": [{
          "mask-l-from": scaleColor()
        }],
        "mask-image-l-to-color": [{
          "mask-l-to": scaleColor()
        }],
        "mask-image-x-from-pos": [{
          "mask-x-from": scaleMaskImagePosition()
        }],
        "mask-image-x-to-pos": [{
          "mask-x-to": scaleMaskImagePosition()
        }],
        "mask-image-x-from-color": [{
          "mask-x-from": scaleColor()
        }],
        "mask-image-x-to-color": [{
          "mask-x-to": scaleColor()
        }],
        "mask-image-y-from-pos": [{
          "mask-y-from": scaleMaskImagePosition()
        }],
        "mask-image-y-to-pos": [{
          "mask-y-to": scaleMaskImagePosition()
        }],
        "mask-image-y-from-color": [{
          "mask-y-from": scaleColor()
        }],
        "mask-image-y-to-color": [{
          "mask-y-to": scaleColor()
        }],
        "mask-image-radial": [{
          "mask-radial": [isArbitraryVariable, isArbitraryValue]
        }],
        "mask-image-radial-from-pos": [{
          "mask-radial-from": scaleMaskImagePosition()
        }],
        "mask-image-radial-to-pos": [{
          "mask-radial-to": scaleMaskImagePosition()
        }],
        "mask-image-radial-from-color": [{
          "mask-radial-from": scaleColor()
        }],
        "mask-image-radial-to-color": [{
          "mask-radial-to": scaleColor()
        }],
        "mask-image-radial-shape": [{
          "mask-radial": ["circle", "ellipse"]
        }],
        "mask-image-radial-size": [{
          "mask-radial": [{
            closest: ["side", "corner"],
            farthest: ["side", "corner"]
          }]
        }],
        "mask-image-radial-pos": [{
          "mask-radial-at": scalePosition()
        }],
        "mask-image-conic-pos": [{
          "mask-conic": [isNumber]
        }],
        "mask-image-conic-from-pos": [{
          "mask-conic-from": scaleMaskImagePosition()
        }],
        "mask-image-conic-to-pos": [{
          "mask-conic-to": scaleMaskImagePosition()
        }],
        "mask-image-conic-from-color": [{
          "mask-conic-from": scaleColor()
        }],
        "mask-image-conic-to-color": [{
          "mask-conic-to": scaleColor()
        }],
        /**
         * Mask Mode
         * @see https://tailwindcss.com/docs/mask-mode
         */
        "mask-mode": [{
          mask: ["alpha", "luminance", "match"]
        }],
        /**
         * Mask Origin
         * @see https://tailwindcss.com/docs/mask-origin
         */
        "mask-origin": [{
          "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
        }],
        /**
         * Mask Position
         * @see https://tailwindcss.com/docs/mask-position
         */
        "mask-position": [{
          mask: scaleBgPosition()
        }],
        /**
         * Mask Repeat
         * @see https://tailwindcss.com/docs/mask-repeat
         */
        "mask-repeat": [{
          mask: scaleBgRepeat()
        }],
        /**
         * Mask Size
         * @see https://tailwindcss.com/docs/mask-size
         */
        "mask-size": [{
          mask: scaleBgSize()
        }],
        /**
         * Mask Type
         * @see https://tailwindcss.com/docs/mask-type
         */
        "mask-type": [{
          "mask-type": ["alpha", "luminance"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image": [{
          mask: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------
        // --- Filters ---
        // ---------------
        /**
         * Filter
         * @see https://tailwindcss.com/docs/filter
         */
        filter: [{
          filter: [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Blur
         * @see https://tailwindcss.com/docs/blur
         */
        blur: [{
          blur: scaleBlur()
        }],
        /**
         * Brightness
         * @see https://tailwindcss.com/docs/brightness
         */
        brightness: [{
          brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Contrast
         * @see https://tailwindcss.com/docs/contrast
         */
        contrast: [{
          contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Drop Shadow
         * @see https://tailwindcss.com/docs/drop-shadow
         */
        "drop-shadow": [{
          "drop-shadow": [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeDropShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Drop Shadow Color
         * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
         */
        "drop-shadow-color": [{
          "drop-shadow": scaleColor()
        }],
        /**
         * Grayscale
         * @see https://tailwindcss.com/docs/grayscale
         */
        grayscale: [{
          grayscale: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Hue Rotate
         * @see https://tailwindcss.com/docs/hue-rotate
         */
        "hue-rotate": [{
          "hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Invert
         * @see https://tailwindcss.com/docs/invert
         */
        invert: [{
          invert: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Saturate
         * @see https://tailwindcss.com/docs/saturate
         */
        saturate: [{
          saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Sepia
         * @see https://tailwindcss.com/docs/sepia
         */
        sepia: [{
          sepia: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Filter
         * @see https://tailwindcss.com/docs/backdrop-filter
         */
        "backdrop-filter": [{
          "backdrop-filter": [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Backdrop Blur
         * @see https://tailwindcss.com/docs/backdrop-blur
         */
        "backdrop-blur": [{
          "backdrop-blur": scaleBlur()
        }],
        /**
         * Backdrop Brightness
         * @see https://tailwindcss.com/docs/backdrop-brightness
         */
        "backdrop-brightness": [{
          "backdrop-brightness": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Contrast
         * @see https://tailwindcss.com/docs/backdrop-contrast
         */
        "backdrop-contrast": [{
          "backdrop-contrast": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Grayscale
         * @see https://tailwindcss.com/docs/backdrop-grayscale
         */
        "backdrop-grayscale": [{
          "backdrop-grayscale": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Hue Rotate
         * @see https://tailwindcss.com/docs/backdrop-hue-rotate
         */
        "backdrop-hue-rotate": [{
          "backdrop-hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Invert
         * @see https://tailwindcss.com/docs/backdrop-invert
         */
        "backdrop-invert": [{
          "backdrop-invert": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Opacity
         * @see https://tailwindcss.com/docs/backdrop-opacity
         */
        "backdrop-opacity": [{
          "backdrop-opacity": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Saturate
         * @see https://tailwindcss.com/docs/backdrop-saturate
         */
        "backdrop-saturate": [{
          "backdrop-saturate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Sepia
         * @see https://tailwindcss.com/docs/backdrop-sepia
         */
        "backdrop-sepia": [{
          "backdrop-sepia": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        // --------------
        // --- Tables ---
        // --------------
        /**
         * Border Collapse
         * @see https://tailwindcss.com/docs/border-collapse
         */
        "border-collapse": [{
          border: ["collapse", "separate"]
        }],
        /**
         * Border Spacing
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing": [{
          "border-spacing": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing X
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-x": [{
          "border-spacing-x": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing Y
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-y": [{
          "border-spacing-y": scaleUnambiguousSpacing()
        }],
        /**
         * Table Layout
         * @see https://tailwindcss.com/docs/table-layout
         */
        "table-layout": [{
          table: ["auto", "fixed"]
        }],
        /**
         * Caption Side
         * @see https://tailwindcss.com/docs/caption-side
         */
        caption: [{
          caption: ["top", "bottom"]
        }],
        // ---------------------------------
        // --- Transitions and Animation ---
        // ---------------------------------
        /**
         * Transition Property
         * @see https://tailwindcss.com/docs/transition-property
         */
        transition: [{
          transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Behavior
         * @see https://tailwindcss.com/docs/transition-behavior
         */
        "transition-behavior": [{
          transition: ["normal", "discrete"]
        }],
        /**
         * Transition Duration
         * @see https://tailwindcss.com/docs/transition-duration
         */
        duration: [{
          duration: [isNumber, "initial", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Timing Function
         * @see https://tailwindcss.com/docs/transition-timing-function
         */
        ease: [{
          ease: ["linear", "initial", themeEase, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Delay
         * @see https://tailwindcss.com/docs/transition-delay
         */
        delay: [{
          delay: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Animation
         * @see https://tailwindcss.com/docs/animation
         */
        animate: [{
          animate: ["none", themeAnimate, isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------
        // --- Transforms ---
        // ------------------
        /**
         * Backface Visibility
         * @see https://tailwindcss.com/docs/backface-visibility
         */
        backface: [{
          backface: ["hidden", "visible"]
        }],
        /**
         * Perspective
         * @see https://tailwindcss.com/docs/perspective
         */
        perspective: [{
          perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Perspective Origin
         * @see https://tailwindcss.com/docs/perspective-origin
         */
        "perspective-origin": [{
          "perspective-origin": scalePositionWithArbitrary()
        }],
        /**
         * Rotate
         * @see https://tailwindcss.com/docs/rotate
         */
        rotate: [{
          rotate: scaleRotate()
        }],
        /**
         * Rotate X
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-x": [{
          "rotate-x": scaleRotate()
        }],
        /**
         * Rotate Y
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-y": [{
          "rotate-y": scaleRotate()
        }],
        /**
         * Rotate Z
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-z": [{
          "rotate-z": scaleRotate()
        }],
        /**
         * Scale
         * @see https://tailwindcss.com/docs/scale
         */
        scale: [{
          scale: scaleScale()
        }],
        /**
         * Scale X
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-x": [{
          "scale-x": scaleScale()
        }],
        /**
         * Scale Y
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-y": [{
          "scale-y": scaleScale()
        }],
        /**
         * Scale Z
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-z": [{
          "scale-z": scaleScale()
        }],
        /**
         * Scale 3D
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-3d": ["scale-3d"],
        /**
         * Skew
         * @see https://tailwindcss.com/docs/skew
         */
        skew: [{
          skew: scaleSkew()
        }],
        /**
         * Skew X
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-x": [{
          "skew-x": scaleSkew()
        }],
        /**
         * Skew Y
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-y": [{
          "skew-y": scaleSkew()
        }],
        /**
         * Transform
         * @see https://tailwindcss.com/docs/transform
         */
        transform: [{
          transform: [isArbitraryVariable, isArbitraryValue, "", "none", "gpu", "cpu"]
        }],
        /**
         * Transform Origin
         * @see https://tailwindcss.com/docs/transform-origin
         */
        "transform-origin": [{
          origin: scalePositionWithArbitrary()
        }],
        /**
         * Transform Style
         * @see https://tailwindcss.com/docs/transform-style
         */
        "transform-style": [{
          transform: ["3d", "flat"]
        }],
        /**
         * Translate
         * @see https://tailwindcss.com/docs/translate
         */
        translate: [{
          translate: scaleTranslate()
        }],
        /**
         * Translate X
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-x": [{
          "translate-x": scaleTranslate()
        }],
        /**
         * Translate Y
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-y": [{
          "translate-y": scaleTranslate()
        }],
        /**
         * Translate Z
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-z": [{
          "translate-z": scaleTranslate()
        }],
        /**
         * Translate None
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-none": ["translate-none"],
        /**
         * Zoom
         * @see https://tailwindcss.com/docs/zoom
         */
        zoom: [{
          zoom: [isInteger, isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------------
        // --- Interactivity ---
        // ---------------------
        /**
         * Accent Color
         * @see https://tailwindcss.com/docs/accent-color
         */
        accent: [{
          accent: scaleColor()
        }],
        /**
         * Appearance
         * @see https://tailwindcss.com/docs/appearance
         */
        appearance: [{
          appearance: ["none", "auto"]
        }],
        /**
         * Caret Color
         * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
         */
        "caret-color": [{
          caret: scaleColor()
        }],
        /**
         * Color Scheme
         * @see https://tailwindcss.com/docs/color-scheme
         */
        "color-scheme": [{
          scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
        }],
        /**
         * Cursor
         * @see https://tailwindcss.com/docs/cursor
         */
        cursor: [{
          cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Field Sizing
         * @see https://tailwindcss.com/docs/field-sizing
         */
        "field-sizing": [{
          "field-sizing": ["fixed", "content"]
        }],
        /**
         * Pointer Events
         * @see https://tailwindcss.com/docs/pointer-events
         */
        "pointer-events": [{
          "pointer-events": ["auto", "none"]
        }],
        /**
         * Resize
         * @see https://tailwindcss.com/docs/resize
         */
        resize: [{
          resize: ["none", "", "y", "x"]
        }],
        /**
         * Scroll Behavior
         * @see https://tailwindcss.com/docs/scroll-behavior
         */
        "scroll-behavior": [{
          scroll: ["auto", "smooth"]
        }],
        /**
         * Scrollbar Thumb Color
         * @see https://tailwindcss.com/docs/scrollbar-color
         */
        "scrollbar-thumb-color": [{
          "scrollbar-thumb": scaleColor()
        }],
        /**
         * Scrollbar Track Color
         * @see https://tailwindcss.com/docs/scrollbar-color
         */
        "scrollbar-track-color": [{
          "scrollbar-track": scaleColor()
        }],
        /**
         * Scrollbar Gutter
         * @see https://tailwindcss.com/docs/scrollbar-gutter
         */
        "scrollbar-gutter": [{
          "scrollbar-gutter": ["auto", "stable", "both"]
        }],
        /**
         * Scrollbar Width
         * @see https://tailwindcss.com/docs/scrollbar-width
         */
        "scrollbar-w": [{
          scrollbar: ["auto", "thin", "none"]
        }],
        /**
         * Scroll Margin
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-m": [{
          "scroll-m": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mx": [{
          "scroll-mx": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-my": [{
          "scroll-my": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ms": [{
          "scroll-ms": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-me": [{
          "scroll-me": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbs": [{
          "scroll-mbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbe": [{
          "scroll-mbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Top
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mt": [{
          "scroll-mt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Right
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mr": [{
          "scroll-mr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Bottom
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mb": [{
          "scroll-mb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Left
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ml": [{
          "scroll-ml": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-p": [{
          "scroll-p": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-px": [{
          "scroll-px": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-py": [{
          "scroll-py": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-ps": [{
          "scroll-ps": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pe": [{
          "scroll-pe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbs": [{
          "scroll-pbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbe": [{
          "scroll-pbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Top
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pt": [{
          "scroll-pt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Right
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pr": [{
          "scroll-pr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Bottom
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pb": [{
          "scroll-pb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Left
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pl": [{
          "scroll-pl": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Snap Align
         * @see https://tailwindcss.com/docs/scroll-snap-align
         */
        "snap-align": [{
          snap: ["start", "end", "center", "align-none"]
        }],
        /**
         * Scroll Snap Stop
         * @see https://tailwindcss.com/docs/scroll-snap-stop
         */
        "snap-stop": [{
          snap: ["normal", "always"]
        }],
        /**
         * Scroll Snap Type
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-type": [{
          snap: ["none", "x", "y", "both"]
        }],
        /**
         * Scroll Snap Type Strictness
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-strictness": [{
          snap: ["mandatory", "proximity"]
        }],
        /**
         * Touch Action
         * @see https://tailwindcss.com/docs/touch-action
         */
        touch: [{
          touch: ["auto", "none", "manipulation"]
        }],
        /**
         * Touch Action X
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-x": [{
          "touch-pan": ["x", "left", "right"]
        }],
        /**
         * Touch Action Y
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-y": [{
          "touch-pan": ["y", "up", "down"]
        }],
        /**
         * Touch Action Pinch Zoom
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-pz": ["touch-pinch-zoom"],
        /**
         * User Select
         * @see https://tailwindcss.com/docs/user-select
         */
        select: [{
          select: ["none", "text", "all", "auto"]
        }],
        /**
         * Will Change
         * @see https://tailwindcss.com/docs/will-change
         */
        "will-change": [{
          "will-change": ["auto", "scroll", "contents", "transform", isArbitraryVariable, isArbitraryValue]
        }],
        // -----------
        // --- SVG ---
        // -----------
        /**
         * Fill
         * @see https://tailwindcss.com/docs/fill
         */
        fill: [{
          fill: ["none", ...scaleColor()]
        }],
        /**
         * Stroke Width
         * @see https://tailwindcss.com/docs/stroke-width
         */
        "stroke-w": [{
          stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
        }],
        /**
         * Stroke
         * @see https://tailwindcss.com/docs/stroke
         */
        stroke: [{
          stroke: ["none", ...scaleColor()]
        }],
        // ---------------------
        // --- Accessibility ---
        // ---------------------
        /**
         * Forced Color Adjust
         * @see https://tailwindcss.com/docs/forced-color-adjust
         */
        "forced-color-adjust": [{
          "forced-color-adjust": ["auto", "none"]
        }]
      },
      conflictingClassGroups: {
        "container-named": ["container-type"],
        overflow: ["overflow-x", "overflow-y"],
        overscroll: ["overscroll-x", "overscroll-y"],
        inset: ["inset-x", "inset-y", "inset-bs", "inset-be", "start", "end", "top", "right", "bottom", "left"],
        "inset-x": ["right", "left"],
        "inset-y": ["top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
        px: ["pr", "pl"],
        py: ["pt", "pb"],
        m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
        mx: ["mr", "ml"],
        my: ["mt", "mb"],
        size: ["w", "h"],
        "font-size": ["leading"],
        "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
        "fvn-ordinal": ["fvn-normal"],
        "fvn-slashed-zero": ["fvn-normal"],
        "fvn-figure": ["fvn-normal"],
        "fvn-spacing": ["fvn-normal"],
        "fvn-fraction": ["fvn-normal"],
        "line-clamp": ["display", "overflow"],
        rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
        "rounded-s": ["rounded-ss", "rounded-es"],
        "rounded-e": ["rounded-se", "rounded-ee"],
        "rounded-t": ["rounded-tl", "rounded-tr"],
        "rounded-r": ["rounded-tr", "rounded-br"],
        "rounded-b": ["rounded-br", "rounded-bl"],
        "rounded-l": ["rounded-tl", "rounded-bl"],
        "border-spacing": ["border-spacing-x", "border-spacing-y"],
        "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-bs", "border-w-be", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
        "border-w-x": ["border-w-r", "border-w-l"],
        "border-w-y": ["border-w-t", "border-w-b"],
        "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
        "border-color-x": ["border-color-r", "border-color-l"],
        "border-color-y": ["border-color-t", "border-color-b"],
        translate: ["translate-x", "translate-y", "translate-none"],
        "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
        "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
        "scroll-mx": ["scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mt", "scroll-mb"],
        "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
        "scroll-px": ["scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pt", "scroll-pb"],
        touch: ["touch-x", "touch-y", "touch-pz"],
        "touch-x": ["touch"],
        "touch-y": ["touch"],
        "touch-pz": ["touch"]
      },
      conflictingClassGroupModifiers: {
        "font-size": ["leading"]
      },
      postfixLookupClassGroups: ["container-type"],
      orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
    };
  };
  var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

  // src/lib/utils.ts
  function cn(...inputs) {
    return twMerge(clsx(inputs));
  }

  // src/components/ui/badge.tsx
  var badgeVariants = cva(
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
          secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
          destructive: "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
          outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
          ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
          link: "text-primary underline-offset-4 hover:underline"
        }
      },
      defaultVariants: {
        variant: "default"
      }
    }
  );
  function Badge({
    className,
    variant = "default",
    asChild = false,
    ...props
  }) {
    const Comp = asChild ? dist_exports.Root : "span";
    return /* @__PURE__ */ React44.createElement(
      Comp,
      {
        "data-slot": "badge",
        "data-variant": variant,
        className: cn(badgeVariants({ variant }), className),
        ...props
      }
    );
  }

  // src/components/ui/button.tsx
  init_define_import_meta_env();
  var React45 = __toESM(require_react_shim(), 1);
  var buttonVariants = cva(
    "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground hover:bg-primary/80",
          outline: "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
          secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
          ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
          destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
          link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
          default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
          sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
          lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          icon: "size-8",
          "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
          "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
          "icon-lg": "size-9"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  function Button({
    className,
    variant = "default",
    size: size4 = "default",
    asChild = false,
    ...props
  }) {
    const Comp = asChild ? dist_exports.Root : "button";
    return /* @__PURE__ */ React45.createElement(
      Comp,
      {
        "data-slot": "button",
        "data-variant": variant,
        "data-size": size4,
        className: cn(buttonVariants({ variant, size: size4, className })),
        ...props
      }
    );
  }

  // src/components/ui/calendar.tsx
  init_define_import_meta_env();
  var React72 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/constants/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/date/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/tzName/index.js
  init_define_import_meta_env();
  function tzName(timeZone, date, format2 = "long") {
    return new Intl.DateTimeFormat("en-US", {
      // Enforces engine to render the time. Without the option JavaScriptCore omits it.
      hour: "numeric",
      timeZone,
      timeZoneName: format2
    }).format(date).split(/\s/g).slice(2).join(" ");
  }

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/date/mini.js
  init_define_import_meta_env();

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/tzOffset/index.js
  init_define_import_meta_env();
  var offsetFormatCache = {};
  var offsetCache = {};
  function tzOffset(timeZone, date) {
    try {
      const format2 = offsetFormatCache[timeZone] || (offsetFormatCache[timeZone] = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "longOffset"
      }).format);
      const offsetStr = format2(date).split("GMT")[1];
      if (offsetStr in offsetCache) return offsetCache[offsetStr];
      return calcOffset(offsetStr, offsetStr.split(":"));
    } catch {
      if (timeZone in offsetCache) return offsetCache[timeZone];
      const captures = timeZone?.match(offsetRe);
      if (captures) return calcOffset(timeZone, captures.slice(1));
      return NaN;
    }
  }
  var offsetRe = /([+-]\d\d):?(\d\d)?/;
  function calcOffset(cacheStr, values) {
    const hours = +(values[0] || 0);
    const minutes = +(values[1] || 0);
    const seconds = +(values[2] || 0) / 60;
    return offsetCache[cacheStr] = hours * 60 + minutes > 0 ? hours * 60 + minutes + seconds : hours * 60 - minutes - seconds;
  }

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/date/mini.js
  var TZDateMini = class _TZDateMini extends Date {
    //#region static
    constructor(...args) {
      super();
      if (args.length > 1 && typeof args[args.length - 1] === "string") {
        this.timeZone = args.pop();
      }
      this.internal = /* @__PURE__ */ new Date();
      if (isNaN(tzOffset(this.timeZone, this))) {
        this.setTime(NaN);
      } else {
        if (!args.length) {
          this.setTime(Date.now());
        } else if (typeof args[0] === "number" && (args.length === 1 || args.length === 2 && typeof args[1] !== "number")) {
          this.setTime(args[0]);
        } else if (typeof args[0] === "string") {
          this.setTime(+new Date(args[0]));
        } else if (args[0] instanceof Date) {
          this.setTime(+args[0]);
        } else {
          this.setTime(+new Date(...args));
          adjustToSystemTZ(this, args);
        }
      }
    }
    static tz(tz, ...args) {
      return args.length ? new _TZDateMini(...args, tz) : new _TZDateMini(Date.now(), tz);
    }
    //#endregion
    //#region time zone
    withTimeZone(timeZone) {
      return new _TZDateMini(+this, timeZone);
    }
    getTimezoneOffset() {
      const offset4 = -tzOffset(this.timeZone, this);
      return offset4 > 0 ? Math.floor(offset4) : Math.ceil(offset4);
    }
    //#endregion
    //#region time
    setTime(_time) {
      Date.prototype.setTime.apply(this, arguments);
      syncToInternal(this);
      return +this;
    }
    //#endregion
    //#region date-fns integration
    [/* @__PURE__ */ Symbol.for("constructDateFrom")](date) {
      return new _TZDateMini(+new Date(date), this.timeZone);
    }
    //#endregion
  };
  var re = /^(get|set)(?!UTC)/;
  Object.getOwnPropertyNames(Date.prototype).forEach((method) => {
    if (!re.test(method)) return;
    const utcMethod = method.replace(re, "$1UTC");
    if (!TZDateMini.prototype[utcMethod]) return;
    if (method.startsWith("get")) {
      TZDateMini.prototype[method] = function() {
        return this.internal[utcMethod]();
      };
    } else {
      TZDateMini.prototype[method] = function() {
        Date.prototype[utcMethod].apply(this.internal, arguments);
        syncFromInternal(this);
        return +this;
      };
      TZDateMini.prototype[utcMethod] = function() {
        Date.prototype[utcMethod].apply(this, arguments);
        syncToInternal(this);
        return +this;
      };
    }
  });
  function syncToInternal(date) {
    date.internal.setTime(+date);
    date.internal.setUTCSeconds(date.internal.getUTCSeconds() - // Round after converting minutes to seconds to avoid fractional offset
    // precision errors from historical offsets.
    Math.round(-tzOffset(date.timeZone, date) * 60));
  }
  function syncFromInternal(date) {
    Date.prototype.setFullYear.call(date, date.internal.getUTCFullYear(), date.internal.getUTCMonth(), date.internal.getUTCDate());
    Date.prototype.setHours.call(date, date.internal.getUTCHours(), date.internal.getUTCMinutes(), date.internal.getUTCSeconds(), date.internal.getUTCMilliseconds());
    adjustToSystemTZ(date);
  }
  function adjustToSystemTZ(date, constructorArgs) {
    const expectedInternalTime = Array.isArray(constructorArgs) ? constructorArgsToInternalTime(constructorArgs) : +date.internal;
    const offsetWithSeconds = tzOffset(date.timeZone, date);
    const offset4 = offsetWithSeconds > 0 ? Math.floor(offsetWithSeconds) : Math.ceil(offsetWithSeconds);
    const prevHour = /* @__PURE__ */ new Date(+date);
    prevHour.setUTCHours(prevHour.getUTCHours() - 1);
    const systemOffset = -(/* @__PURE__ */ new Date(+date)).getTimezoneOffset();
    const prevHourSystemOffset = -(/* @__PURE__ */ new Date(+prevHour)).getTimezoneOffset();
    const systemDSTChange = systemOffset - prevHourSystemOffset;
    let systemOffsetForDiff = systemOffset;
    if (systemDSTChange && systemOffset !== offset4) {
      const systemHour = Date.prototype.getHours.apply(date);
      const expectedHour = Array.isArray(constructorArgs) ? constructorArgs[3] || 0 : date.internal.getUTCHours();
      if (systemHour !== expectedHour) {
        const testDate = /* @__PURE__ */ new Date(+date);
        const testOffsetDiff = systemOffset - offset4;
        if (testOffsetDiff) testDate.setUTCMinutes(testDate.getUTCMinutes() + testOffsetDiff);
        const testOffsetWithSeconds = tzOffset(date.timeZone, testDate);
        const testOffset = testOffsetWithSeconds > 0 ? Math.floor(testOffsetWithSeconds) : Math.ceil(testOffsetWithSeconds);
        if (testOffset === offset4) systemOffsetForDiff = prevHourSystemOffset;
      }
    }
    const offsetDiff = systemOffsetForDiff - offset4;
    if (offsetDiff)
      Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + offsetDiff);
    const systemDate = /* @__PURE__ */ new Date(+date);
    systemDate.setUTCSeconds(0);
    const systemSecondsOffset = systemOffset > 0 ? systemDate.getSeconds() : (systemDate.getSeconds() - 60) % 60;
    const secondsOffset = Math.round(-(tzOffset(date.timeZone, date) * 60)) % 60;
    if (secondsOffset || systemSecondsOffset)
      Date.prototype.setUTCSeconds.call(date, Date.prototype.getUTCSeconds.call(date) + secondsOffset + systemSecondsOffset);
    const postOffsetWithSeconds = tzOffset(date.timeZone, date);
    const postOffset = postOffsetWithSeconds > 0 ? Math.floor(postOffsetWithSeconds) : Math.ceil(postOffsetWithSeconds);
    const postSystemOffset = -(/* @__PURE__ */ new Date(+date)).getTimezoneOffset();
    const postOffsetDiff = postSystemOffset - postOffset;
    const offsetChanged = postOffset !== offset4;
    const postDiff = postOffsetDiff - offsetDiff;
    const targetDSTShift = postOffset - offset4;
    const postOffsetCandidate = expectedInternalTime - postOffset * 60 * 1e3;
    const normalizedTargetDSTGap = targetDSTShift > 0 && targetInternalTime(date) - expectedInternalTime === targetDSTShift * 60 * 1e3 && targetInternalTime(date, postOffsetCandidate) !== expectedInternalTime;
    if (offsetChanged && postDiff && !normalizedTargetDSTGap) {
      Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + postDiff);
      const newOffsetWithSeconds = tzOffset(date.timeZone, date);
      const newOffset = newOffsetWithSeconds > 0 ? Math.floor(newOffsetWithSeconds) : Math.ceil(newOffsetWithSeconds);
      const offsetChange = postOffset - newOffset;
      if (offsetChange && postDiff < 0) {
        Date.prototype.setUTCMinutes.call(date, Date.prototype.getUTCMinutes.call(date) + offsetChange);
      }
    }
    syncToInternal(date);
    const expectedTime = constructorArgs ? expectedInternalTime : expectedInternalTime + secondsOffset * 1e3;
    const drift = expectedTime - +date.internal;
    if (drift && Math.abs(drift) < 30 * 60 * 1e3) {
      Date.prototype.setTime.call(date, +date + drift);
      syncToInternal(date);
    }
  }
  function constructorArgsToInternalTime(args) {
    return Date.UTC(args[0], args.length > 1 ? args[1] : 0, args.length > 2 ? args[2] : 1, ...args.slice(3));
  }
  function targetInternalTime(date, time) {
    const internal = new Date(time ?? +date);
    internal.setUTCSeconds(internal.getUTCSeconds() - Math.round(-tzOffset(date.timeZone, internal) * 60));
    return +internal;
  }

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/date/index.js
  var TZDate = class _TZDate extends TZDateMini {
    //#region static
    static tz(tz, ...args) {
      return args.length ? new _TZDate(...args, tz) : new _TZDate(Date.now(), tz);
    }
    //#endregion
    //#region representation
    toISOString() {
      const [sign, hours, minutes] = this.tzComponents();
      const tz = `${sign}${hours}:${minutes}`;
      return this.internal.toISOString().slice(0, -1) + tz;
    }
    toString() {
      return `${this.toDateString()} ${this.toTimeString()}`;
    }
    toDateString() {
      const [day, date, month, year] = this.internal.toUTCString().split(" ");
      return `${day?.slice(0, -1)} ${month} ${date} ${year}`;
    }
    toTimeString() {
      const time = this.internal.toUTCString().split(" ")[4];
      const [sign, hours, minutes] = this.tzComponents();
      return `${time} GMT${sign}${hours}${minutes} (${tzName(this.timeZone, this)})`;
    }
    toLocaleString(locales, options2) {
      return Date.prototype.toLocaleString.call(this, locales, {
        ...options2,
        timeZone: options2?.timeZone || this.timeZone
      });
    }
    toLocaleDateString(locales, options2) {
      return Date.prototype.toLocaleDateString.call(this, locales, {
        ...options2,
        timeZone: options2?.timeZone || this.timeZone
      });
    }
    toLocaleTimeString(locales, options2) {
      return Date.prototype.toLocaleTimeString.call(this, locales, {
        ...options2,
        timeZone: options2?.timeZone || this.timeZone
      });
    }
    //#endregion
    //#region private
    tzComponents() {
      const offset4 = this.getTimezoneOffset();
      const sign = offset4 > 0 ? "-" : "+";
      const hours = String(Math.floor(Math.abs(offset4) / 60)).padStart(2, "0");
      const minutes = String(Math.abs(offset4) % 60).padStart(2, "0");
      return [sign, hours, minutes];
    }
    //#endregion
    withTimeZone(timeZone) {
      return new _TZDate(+this, timeZone);
    }
    //#region date-fns integration
    [/* @__PURE__ */ Symbol.for("constructDateFrom")](date) {
      return new _TZDate(+new Date(date), this.timeZone);
    }
    //#endregion
  };

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/tz/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/@date-fns+tz@1.5.0/node_modules/@date-fns/tz/tzScan/index.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/classes/CalendarDay.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/classes/DateLib.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/addDays.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/constructFrom.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/constants.js
  init_define_import_meta_env();
  var daysInYear = 365.2425;
  var maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1e3;
  var minTime = -maxTime;
  var millisecondsInWeek = 6048e5;
  var millisecondsInDay = 864e5;
  var secondsInHour = 3600;
  var secondsInDay = secondsInHour * 24;
  var secondsInWeek = secondsInDay * 7;
  var secondsInYear = secondsInDay * daysInYear;
  var secondsInMonth = secondsInYear / 12;
  var secondsInQuarter = secondsInMonth * 3;
  var constructFromSymbol = /* @__PURE__ */ Symbol.for("constructDateFrom");

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/constructFrom.js
  function constructFrom(date, value) {
    if (typeof date === "function") return date(value);
    if (date && typeof date === "object" && constructFromSymbol in date)
      return date[constructFromSymbol](value);
    if (date instanceof Date) return new date.constructor(value);
    return new Date(value);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/toDate.js
  init_define_import_meta_env();
  function toDate(argument, context) {
    return constructFrom(context || argument, argument);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/addDays.js
  function addDays(date, amount, options2) {
    const _date = toDate(date, options2?.in);
    if (isNaN(amount)) return constructFrom(options2?.in || date, NaN);
    if (!amount) return _date;
    _date.setDate(_date.getDate() + amount);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/addMonths.js
  init_define_import_meta_env();
  function addMonths(date, amount, options2) {
    const _date = toDate(date, options2?.in);
    if (isNaN(amount)) return constructFrom(options2?.in || date, NaN);
    if (!amount) {
      return _date;
    }
    const dayOfMonth = _date.getDate();
    const endOfDesiredMonth = constructFrom(options2?.in || date, _date.getTime());
    endOfDesiredMonth.setMonth(_date.getMonth() + amount + 1, 0);
    const daysInMonth = endOfDesiredMonth.getDate();
    if (dayOfMonth >= daysInMonth) {
      return endOfDesiredMonth;
    } else {
      _date.setFullYear(
        endOfDesiredMonth.getFullYear(),
        endOfDesiredMonth.getMonth(),
        dayOfMonth
      );
      return _date;
    }
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getISOWeekYear.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfISOWeek.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfWeek.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/defaultOptions.js
  init_define_import_meta_env();
  var defaultOptions = {};
  function getDefaultOptions() {
    return defaultOptions;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfWeek.js
  function startOfWeek(date, options2) {
    const defaultOptions2 = getDefaultOptions();
    const weekStartsOn = options2?.weekStartsOn ?? options2?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
    const _date = toDate(date, options2?.in);
    const day = _date.getDay();
    const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
    _date.setDate(_date.getDate() - diff);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfISOWeek.js
  function startOfISOWeek(date, options2) {
    return startOfWeek(date, { ...options2, weekStartsOn: 1 });
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getISOWeekYear.js
  function getISOWeekYear(date, options2) {
    const _date = toDate(date, options2?.in);
    const year = _date.getFullYear();
    const fourthOfJanuaryOfNextYear = constructFrom(_date, 0);
    fourthOfJanuaryOfNextYear.setFullYear(year + 1, 0, 4);
    fourthOfJanuaryOfNextYear.setHours(0, 0, 0, 0);
    const startOfNextYear = startOfISOWeek(fourthOfJanuaryOfNextYear);
    const fourthOfJanuaryOfThisYear = constructFrom(_date, 0);
    fourthOfJanuaryOfThisYear.setFullYear(year, 0, 4);
    fourthOfJanuaryOfThisYear.setHours(0, 0, 0, 0);
    const startOfThisYear = startOfISOWeek(fourthOfJanuaryOfThisYear);
    if (_date.getTime() >= startOfNextYear.getTime()) {
      return year + 1;
    } else if (_date.getTime() >= startOfThisYear.getTime()) {
      return year;
    } else {
      return year - 1;
    }
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/differenceInCalendarDays.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/getTimezoneOffsetInMilliseconds.js
  init_define_import_meta_env();
  function getTimezoneOffsetInMilliseconds(date) {
    const _date = toDate(date);
    const utcDate = new Date(
      Date.UTC(
        _date.getFullYear(),
        _date.getMonth(),
        _date.getDate(),
        _date.getHours(),
        _date.getMinutes(),
        _date.getSeconds(),
        _date.getMilliseconds()
      )
    );
    utcDate.setUTCFullYear(_date.getFullYear());
    return +date - +utcDate;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/normalizeDates.js
  init_define_import_meta_env();
  function normalizeDates(context, ...dates) {
    const normalize = constructFrom.bind(
      null,
      context || dates.find((date) => typeof date === "object")
    );
    return dates.map(normalize);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfDay.js
  init_define_import_meta_env();
  function startOfDay(date, options2) {
    const _date = toDate(date, options2?.in);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/differenceInCalendarDays.js
  function differenceInCalendarDays(laterDate, earlierDate, options2) {
    const [laterDate_, earlierDate_] = normalizeDates(
      options2?.in,
      laterDate,
      earlierDate
    );
    const laterStartOfDay = startOfDay(laterDate_);
    const earlierStartOfDay = startOfDay(earlierDate_);
    const laterTimestamp = +laterStartOfDay - getTimezoneOffsetInMilliseconds(laterStartOfDay);
    const earlierTimestamp = +earlierStartOfDay - getTimezoneOffsetInMilliseconds(earlierStartOfDay);
    return Math.round((laterTimestamp - earlierTimestamp) / millisecondsInDay);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfISOWeekYear.js
  init_define_import_meta_env();
  function startOfISOWeekYear(date, options2) {
    const year = getISOWeekYear(date, options2);
    const fourthOfJanuary = constructFrom(options2?.in || date, 0);
    fourthOfJanuary.setFullYear(year, 0, 4);
    fourthOfJanuary.setHours(0, 0, 0, 0);
    return startOfISOWeek(fourthOfJanuary);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/addWeeks.js
  init_define_import_meta_env();
  function addWeeks(date, amount, options2) {
    return addDays(date, amount * 7, options2);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/addYears.js
  init_define_import_meta_env();
  function addYears(date, amount, options2) {
    return addMonths(date, amount * 12, options2);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/max.js
  init_define_import_meta_env();
  function max2(dates, options2) {
    let result;
    let context = options2?.in;
    dates.forEach((date) => {
      if (!context && typeof date === "object")
        context = constructFrom.bind(null, date);
      const date_ = toDate(date, context);
      if (!result || result < date_ || isNaN(+date_)) result = date_;
    });
    return constructFrom(context, result || NaN);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/min.js
  init_define_import_meta_env();
  function min2(dates, options2) {
    let result;
    let context = options2?.in;
    dates.forEach((date) => {
      if (!context && typeof date === "object")
        context = constructFrom.bind(null, date);
      const date_ = toDate(date, context);
      if (!result || result > date_ || isNaN(+date_)) result = date_;
    });
    return constructFrom(context, result || NaN);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isSameDay.js
  init_define_import_meta_env();
  function isSameDay(laterDate, earlierDate, options2) {
    const [dateLeft_, dateRight_] = normalizeDates(
      options2?.in,
      laterDate,
      earlierDate
    );
    return +startOfDay(dateLeft_) === +startOfDay(dateRight_);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isValid.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isDate.js
  init_define_import_meta_env();
  function isDate(value) {
    return value instanceof Date || typeof value === "object" && Object.prototype.toString.call(value) === "[object Date]";
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isValid.js
  function isValid(date) {
    return !(!isDate(date) && typeof date !== "number" || isNaN(+toDate(date)));
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/differenceInCalendarMonths.js
  init_define_import_meta_env();
  function differenceInCalendarMonths(laterDate, earlierDate, options2) {
    const [laterDate_, earlierDate_] = normalizeDates(
      options2?.in,
      laterDate,
      earlierDate
    );
    const yearsDiff = laterDate_.getFullYear() - earlierDate_.getFullYear();
    const monthsDiff = laterDate_.getMonth() - earlierDate_.getMonth();
    return yearsDiff * 12 + monthsDiff;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/endOfMonth.js
  init_define_import_meta_env();
  function endOfMonth(date, options2) {
    const _date = toDate(date, options2?.in);
    const month = _date.getMonth();
    _date.setFullYear(_date.getFullYear(), month + 1, 0);
    _date.setHours(23, 59, 59, 999);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/normalizeInterval.js
  init_define_import_meta_env();
  function normalizeInterval(context, interval) {
    const [start, end] = normalizeDates(context, interval.start, interval.end);
    return { start, end };
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/eachMonthOfInterval.js
  init_define_import_meta_env();
  function eachMonthOfInterval(interval, options2) {
    const { start, end } = normalizeInterval(options2?.in, interval);
    let reversed = +start > +end;
    const endTime = reversed ? +start : +end;
    const date = reversed ? end : start;
    date.setHours(0, 0, 0, 0);
    date.setDate(1);
    let step = options2?.step ?? 1;
    if (!step) return [];
    if (step < 0) {
      step = -step;
      reversed = !reversed;
    }
    const dates = [];
    while (+date <= endTime) {
      dates.push(constructFrom(start, date));
      date.setMonth(date.getMonth() + step);
    }
    return reversed ? dates.reverse() : dates;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfMonth.js
  init_define_import_meta_env();
  function startOfMonth(date, options2) {
    const _date = toDate(date, options2?.in);
    _date.setDate(1);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/endOfYear.js
  init_define_import_meta_env();
  function endOfYear(date, options2) {
    const _date = toDate(date, options2?.in);
    const year = _date.getFullYear();
    _date.setFullYear(year + 1, 0, 0);
    _date.setHours(23, 59, 59, 999);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfYear.js
  init_define_import_meta_env();
  function startOfYear(date, options2) {
    const date_ = toDate(date, options2?.in);
    date_.setFullYear(date_.getFullYear(), 0, 1);
    date_.setHours(0, 0, 0, 0);
    return date_;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/eachYearOfInterval.js
  init_define_import_meta_env();
  function eachYearOfInterval(interval, options2) {
    const { start, end } = normalizeInterval(options2?.in, interval);
    let reversed = +start > +end;
    const endTime = reversed ? +start : +end;
    const date = reversed ? end : start;
    date.setHours(0, 0, 0, 0);
    date.setMonth(0, 1);
    let step = options2?.step ?? 1;
    if (!step) return [];
    if (step < 0) {
      step = -step;
      reversed = !reversed;
    }
    const dates = [];
    while (+date <= endTime) {
      dates.push(constructFrom(start, date));
      date.setFullYear(date.getFullYear() + step);
    }
    return reversed ? dates.reverse() : dates;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/endOfISOWeek.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/endOfWeek.js
  init_define_import_meta_env();
  function endOfWeek(date, options2) {
    const defaultOptions2 = getDefaultOptions();
    const weekStartsOn = options2?.weekStartsOn ?? options2?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
    const _date = toDate(date, options2?.in);
    const day = _date.getDay();
    const diff = (day < weekStartsOn ? -7 : 0) + 6 - (day - weekStartsOn);
    _date.setDate(_date.getDate() + diff);
    _date.setHours(23, 59, 59, 999);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/endOfISOWeek.js
  function endOfISOWeek(date, options2) {
    return endOfWeek(date, { ...options2, weekStartsOn: 1 });
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/format.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/defaultLocale.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatDistance.js
  init_define_import_meta_env();
  var formatDistanceLocale = {
    lessThanXSeconds: {
      one: "less than a second",
      other: "less than {{count}} seconds"
    },
    xSeconds: {
      one: "1 second",
      other: "{{count}} seconds"
    },
    halfAMinute: "half a minute",
    lessThanXMinutes: {
      one: "less than a minute",
      other: "less than {{count}} minutes"
    },
    xMinutes: {
      one: "1 minute",
      other: "{{count}} minutes"
    },
    aboutXHours: {
      one: "about 1 hour",
      other: "about {{count}} hours"
    },
    xHours: {
      one: "1 hour",
      other: "{{count}} hours"
    },
    xDays: {
      one: "1 day",
      other: "{{count}} days"
    },
    aboutXWeeks: {
      one: "about 1 week",
      other: "about {{count}} weeks"
    },
    xWeeks: {
      one: "1 week",
      other: "{{count}} weeks"
    },
    aboutXMonths: {
      one: "about 1 month",
      other: "about {{count}} months"
    },
    xMonths: {
      one: "1 month",
      other: "{{count}} months"
    },
    aboutXYears: {
      one: "about 1 year",
      other: "about {{count}} years"
    },
    xYears: {
      one: "1 year",
      other: "{{count}} years"
    },
    overXYears: {
      one: "over 1 year",
      other: "over {{count}} years"
    },
    almostXYears: {
      one: "almost 1 year",
      other: "almost {{count}} years"
    }
  };
  var formatDistance = (token, count3, options2) => {
    let result;
    const tokenValue = formatDistanceLocale[token];
    if (typeof tokenValue === "string") {
      result = tokenValue;
    } else if (count3 === 1) {
      result = tokenValue.one;
    } else {
      result = tokenValue.other.replace("{{count}}", count3.toString());
    }
    if (options2?.addSuffix) {
      if (options2.comparison && options2.comparison > 0) {
        return "in " + result;
      } else {
        return result + " ago";
      }
    }
    return result;
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatLong.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildFormatLongFn.js
  init_define_import_meta_env();
  function buildFormatLongFn(args) {
    return (options2 = {}) => {
      const width = options2.width ? String(options2.width) : args.defaultWidth;
      const format2 = args.formats[width] || args.formats[args.defaultWidth];
      return format2;
    };
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatLong.js
  var dateFormats = {
    full: "EEEE, MMMM do, y",
    long: "MMMM do, y",
    medium: "MMM d, y",
    short: "MM/dd/yyyy"
  };
  var timeFormats = {
    full: "h:mm:ss a zzzz",
    long: "h:mm:ss a z",
    medium: "h:mm:ss a",
    short: "h:mm a"
  };
  var dateTimeFormats = {
    full: "{{date}} 'at' {{time}}",
    long: "{{date}} 'at' {{time}}",
    medium: "{{date}}, {{time}}",
    short: "{{date}}, {{time}}"
  };
  var formatLong = {
    date: buildFormatLongFn({
      formats: dateFormats,
      defaultWidth: "full"
    }),
    time: buildFormatLongFn({
      formats: timeFormats,
      defaultWidth: "full"
    }),
    dateTime: buildFormatLongFn({
      formats: dateTimeFormats,
      defaultWidth: "full"
    })
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/formatRelative.js
  init_define_import_meta_env();
  var formatRelativeLocale = {
    lastWeek: "'last' eeee 'at' p",
    yesterday: "'yesterday at' p",
    today: "'today at' p",
    tomorrow: "'tomorrow at' p",
    nextWeek: "eeee 'at' p",
    other: "P"
  };
  var formatRelative = (token, _date, _baseDate, _options) => formatRelativeLocale[token];

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/localize.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildLocalizeFn.js
  init_define_import_meta_env();
  function buildLocalizeFn(args) {
    return (value, options2) => {
      const context = options2?.context ? String(options2.context) : "standalone";
      let valuesArray;
      if (context === "formatting" && args.formattingValues) {
        const defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
        const width = options2?.width ? String(options2.width) : defaultWidth;
        valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
      } else {
        const defaultWidth = args.defaultWidth;
        const width = options2?.width ? String(options2.width) : args.defaultWidth;
        valuesArray = args.values[width] || args.values[defaultWidth];
      }
      const index2 = args.argumentCallback ? args.argumentCallback(value) : value;
      return valuesArray[index2];
    };
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/localize.js
  var eraValues = {
    narrow: ["B", "A"],
    abbreviated: ["BC", "AD"],
    wide: ["Before Christ", "Anno Domini"]
  };
  var quarterValues = {
    narrow: ["1", "2", "3", "4"],
    abbreviated: ["Q1", "Q2", "Q3", "Q4"],
    wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"]
  };
  var monthValues = {
    narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    abbreviated: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ],
    wide: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ]
  };
  var dayValues = {
    narrow: ["S", "M", "T", "W", "T", "F", "S"],
    short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    wide: [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday"
    ]
  };
  var dayPeriodValues = {
    narrow: {
      am: "a",
      pm: "p",
      midnight: "mi",
      noon: "n",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night"
    },
    abbreviated: {
      am: "AM",
      pm: "PM",
      midnight: "midnight",
      noon: "noon",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night"
    },
    wide: {
      am: "a.m.",
      pm: "p.m.",
      midnight: "midnight",
      noon: "noon",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night"
    }
  };
  var formattingDayPeriodValues = {
    narrow: {
      am: "a",
      pm: "p",
      midnight: "mi",
      noon: "n",
      morning: "in the morning",
      afternoon: "in the afternoon",
      evening: "in the evening",
      night: "at night"
    },
    abbreviated: {
      am: "AM",
      pm: "PM",
      midnight: "midnight",
      noon: "noon",
      morning: "in the morning",
      afternoon: "in the afternoon",
      evening: "in the evening",
      night: "at night"
    },
    wide: {
      am: "a.m.",
      pm: "p.m.",
      midnight: "midnight",
      noon: "noon",
      morning: "in the morning",
      afternoon: "in the afternoon",
      evening: "in the evening",
      night: "at night"
    }
  };
  var ordinalNumber = (dirtyNumber, _options) => {
    const number = Number(dirtyNumber);
    const rem100 = number % 100;
    if (rem100 > 20 || rem100 < 10) {
      switch (rem100 % 10) {
        case 1:
          return number + "st";
        case 2:
          return number + "nd";
        case 3:
          return number + "rd";
      }
    }
    return number + "th";
  };
  var localize = {
    ordinalNumber,
    era: buildLocalizeFn({
      values: eraValues,
      defaultWidth: "wide"
    }),
    quarter: buildLocalizeFn({
      values: quarterValues,
      defaultWidth: "wide",
      argumentCallback: (quarter) => quarter - 1
    }),
    month: buildLocalizeFn({
      values: monthValues,
      defaultWidth: "wide"
    }),
    day: buildLocalizeFn({
      values: dayValues,
      defaultWidth: "wide"
    }),
    dayPeriod: buildLocalizeFn({
      values: dayPeriodValues,
      defaultWidth: "wide",
      formattingValues: formattingDayPeriodValues,
      defaultFormattingWidth: "wide"
    })
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/match.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildMatchFn.js
  init_define_import_meta_env();
  function buildMatchFn(args) {
    return (string, options2 = {}) => {
      const width = options2.width;
      const matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
      const matchResult = string.match(matchPattern);
      if (!matchResult) {
        return null;
      }
      const matchedString = matchResult[0];
      const parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
      const key = Array.isArray(parsePatterns) ? findIndex(parsePatterns, (pattern) => pattern.test(matchedString)) : (
        // [TODO] -- I challenge you to fix the type
        findKey(parsePatterns, (pattern) => pattern.test(matchedString))
      );
      let value;
      value = args.valueCallback ? args.valueCallback(key) : key;
      value = options2.valueCallback ? (
        // [TODO] -- I challenge you to fix the type
        options2.valueCallback(value)
      ) : value;
      const rest = string.slice(matchedString.length);
      return { value, rest };
    };
  }
  function findKey(object, predicate) {
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key) && predicate(object[key])) {
        return key;
      }
    }
    return void 0;
  }
  function findIndex(array, predicate) {
    for (let key = 0; key < array.length; key++) {
      if (predicate(array[key])) {
        return key;
      }
    }
    return void 0;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/_lib/buildMatchPatternFn.js
  init_define_import_meta_env();
  function buildMatchPatternFn(args) {
    return (string, options2 = {}) => {
      const matchResult = string.match(args.matchPattern);
      if (!matchResult) return null;
      const matchedString = matchResult[0];
      const parseResult = string.match(args.parsePattern);
      if (!parseResult) return null;
      let value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
      value = options2.valueCallback ? options2.valueCallback(value) : value;
      const rest = string.slice(matchedString.length);
      return { value, rest };
    };
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US/_lib/match.js
  var matchOrdinalNumberPattern = /^(\d+)(th|st|nd|rd)?/i;
  var parseOrdinalNumberPattern = /\d+/i;
  var matchEraPatterns = {
    narrow: /^(b|a)/i,
    abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
    wide: /^(before christ|before common era|anno domini|common era)/i
  };
  var parseEraPatterns = {
    any: [/^b/i, /^(a|c)/i]
  };
  var matchQuarterPatterns = {
    narrow: /^[1234]/i,
    abbreviated: /^q[1234]/i,
    wide: /^[1234](th|st|nd|rd)? quarter/i
  };
  var parseQuarterPatterns = {
    any: [/1/i, /2/i, /3/i, /4/i]
  };
  var matchMonthPatterns = {
    narrow: /^[jfmasond]/i,
    abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
  };
  var parseMonthPatterns = {
    narrow: [
      /^j/i,
      /^f/i,
      /^m/i,
      /^a/i,
      /^m/i,
      /^j/i,
      /^j/i,
      /^a/i,
      /^s/i,
      /^o/i,
      /^n/i,
      /^d/i
    ],
    any: [
      /^ja/i,
      /^f/i,
      /^mar/i,
      /^ap/i,
      /^may/i,
      /^jun/i,
      /^jul/i,
      /^au/i,
      /^s/i,
      /^o/i,
      /^n/i,
      /^d/i
    ]
  };
  var matchDayPatterns = {
    narrow: /^[smtwf]/i,
    short: /^(su|mo|tu|we|th|fr|sa)/i,
    abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
    wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
  };
  var parseDayPatterns = {
    narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
    any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i]
  };
  var matchDayPeriodPatterns = {
    narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
    any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
  };
  var parseDayPeriodPatterns = {
    any: {
      am: /^a/i,
      pm: /^p/i,
      midnight: /^mi/i,
      noon: /^no/i,
      morning: /morning/i,
      afternoon: /afternoon/i,
      evening: /evening/i,
      night: /night/i
    }
  };
  var match = {
    ordinalNumber: buildMatchPatternFn({
      matchPattern: matchOrdinalNumberPattern,
      parsePattern: parseOrdinalNumberPattern,
      valueCallback: (value) => parseInt(value, 10)
    }),
    era: buildMatchFn({
      matchPatterns: matchEraPatterns,
      defaultMatchWidth: "wide",
      parsePatterns: parseEraPatterns,
      defaultParseWidth: "any"
    }),
    quarter: buildMatchFn({
      matchPatterns: matchQuarterPatterns,
      defaultMatchWidth: "wide",
      parsePatterns: parseQuarterPatterns,
      defaultParseWidth: "any",
      valueCallback: (index2) => index2 + 1
    }),
    month: buildMatchFn({
      matchPatterns: matchMonthPatterns,
      defaultMatchWidth: "wide",
      parsePatterns: parseMonthPatterns,
      defaultParseWidth: "any"
    }),
    day: buildMatchFn({
      matchPatterns: matchDayPatterns,
      defaultMatchWidth: "wide",
      parsePatterns: parseDayPatterns,
      defaultParseWidth: "any"
    }),
    dayPeriod: buildMatchFn({
      matchPatterns: matchDayPeriodPatterns,
      defaultMatchWidth: "any",
      parsePatterns: parseDayPeriodPatterns,
      defaultParseWidth: "any"
    })
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/en-US.js
  var enUS = {
    code: "en-US",
    formatDistance,
    formatLong,
    formatRelative,
    localize,
    match,
    options: {
      weekStartsOn: 0,
      firstWeekContainsDate: 1
    }
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/format/formatters.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getDayOfYear.js
  init_define_import_meta_env();
  function getDayOfYear(date, options2) {
    const _date = toDate(date, options2?.in);
    const diff = differenceInCalendarDays(_date, startOfYear(_date));
    const dayOfYear = diff + 1;
    return dayOfYear;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getISOWeek.js
  init_define_import_meta_env();
  function getISOWeek(date, options2) {
    const _date = toDate(date, options2?.in);
    const diff = +startOfISOWeek(_date) - +startOfISOWeekYear(_date);
    return Math.round(diff / millisecondsInWeek) + 1;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getWeek.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfWeekYear.js
  init_define_import_meta_env();

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getWeekYear.js
  init_define_import_meta_env();
  function getWeekYear(date, options2) {
    const _date = toDate(date, options2?.in);
    const year = _date.getFullYear();
    const defaultOptions2 = getDefaultOptions();
    const firstWeekContainsDate = options2?.firstWeekContainsDate ?? options2?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
    const firstWeekOfNextYear = constructFrom(options2?.in || date, 0);
    firstWeekOfNextYear.setFullYear(year + 1, 0, firstWeekContainsDate);
    firstWeekOfNextYear.setHours(0, 0, 0, 0);
    const startOfNextYear = startOfWeek(firstWeekOfNextYear, options2);
    const firstWeekOfThisYear = constructFrom(options2?.in || date, 0);
    firstWeekOfThisYear.setFullYear(year, 0, firstWeekContainsDate);
    firstWeekOfThisYear.setHours(0, 0, 0, 0);
    const startOfThisYear = startOfWeek(firstWeekOfThisYear, options2);
    if (+_date >= +startOfNextYear) {
      return year + 1;
    } else if (+_date >= +startOfThisYear) {
      return year;
    } else {
      return year - 1;
    }
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/startOfWeekYear.js
  function startOfWeekYear(date, options2) {
    const defaultOptions2 = getDefaultOptions();
    const firstWeekContainsDate = options2?.firstWeekContainsDate ?? options2?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
    const year = getWeekYear(date, options2);
    const firstWeek = constructFrom(options2?.in || date, 0);
    firstWeek.setFullYear(year, 0, firstWeekContainsDate);
    firstWeek.setHours(0, 0, 0, 0);
    const _date = startOfWeek(firstWeek, options2);
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getWeek.js
  function getWeek(date, options2) {
    const _date = toDate(date, options2?.in);
    const diff = +startOfWeek(_date, options2) - +startOfWeekYear(_date, options2);
    return Math.round(diff / millisecondsInWeek) + 1;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/addLeadingZeros.js
  init_define_import_meta_env();
  function addLeadingZeros(number, targetLength) {
    const sign = number < 0 ? "-" : "";
    const output = Math.abs(number).toString().padStart(targetLength, "0");
    return sign + output;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/format/lightFormatters.js
  init_define_import_meta_env();
  var lightFormatters = {
    // Year
    y(date, token) {
      const signedYear = date.getFullYear();
      const year = signedYear > 0 ? signedYear : 1 - signedYear;
      return addLeadingZeros(token === "yy" ? year % 100 : year, token.length);
    },
    // Month
    M(date, token) {
      const month = date.getMonth();
      return token === "M" ? String(month + 1) : addLeadingZeros(month + 1, 2);
    },
    // Day of the month
    d(date, token) {
      return addLeadingZeros(date.getDate(), token.length);
    },
    // AM or PM
    a(date, token) {
      const dayPeriodEnumValue = date.getHours() / 12 >= 1 ? "pm" : "am";
      switch (token) {
        case "a":
        case "aa":
          return dayPeriodEnumValue.toUpperCase();
        case "aaa":
          return dayPeriodEnumValue;
        case "aaaaa":
          return dayPeriodEnumValue[0];
        case "aaaa":
        default:
          return dayPeriodEnumValue === "am" ? "a.m." : "p.m.";
      }
    },
    // Hour [1-12]
    h(date, token) {
      return addLeadingZeros(date.getHours() % 12 || 12, token.length);
    },
    // Hour [0-23]
    H(date, token) {
      return addLeadingZeros(date.getHours(), token.length);
    },
    // Minute
    m(date, token) {
      return addLeadingZeros(date.getMinutes(), token.length);
    },
    // Second
    s(date, token) {
      return addLeadingZeros(date.getSeconds(), token.length);
    },
    // Fraction of second
    S(date, token) {
      const numberOfDigits = token.length;
      const milliseconds = date.getMilliseconds();
      const fractionalSeconds = Math.trunc(
        milliseconds * Math.pow(10, numberOfDigits - 3)
      );
      return addLeadingZeros(fractionalSeconds, token.length);
    }
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/format/formatters.js
  var dayPeriodEnum = {
    am: "am",
    pm: "pm",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  };
  var formatters = {
    // Era
    G: function(date, token, localize2) {
      const era = date.getFullYear() > 0 ? 1 : 0;
      switch (token) {
        // AD, BC
        case "G":
        case "GG":
        case "GGG":
          return localize2.era(era, { width: "abbreviated" });
        // A, B
        case "GGGGG":
          return localize2.era(era, { width: "narrow" });
        // Anno Domini, Before Christ
        case "GGGG":
        default:
          return localize2.era(era, { width: "wide" });
      }
    },
    // Year
    y: function(date, token, localize2) {
      if (token === "yo") {
        const signedYear = date.getFullYear();
        const year = signedYear > 0 ? signedYear : 1 - signedYear;
        return localize2.ordinalNumber(year, { unit: "year" });
      }
      return lightFormatters.y(date, token);
    },
    // Local week-numbering year
    Y: function(date, token, localize2, options2) {
      const signedWeekYear = getWeekYear(date, options2);
      const weekYear = signedWeekYear > 0 ? signedWeekYear : 1 - signedWeekYear;
      if (token === "YY") {
        const twoDigitYear = weekYear % 100;
        return addLeadingZeros(twoDigitYear, 2);
      }
      if (token === "Yo") {
        return localize2.ordinalNumber(weekYear, { unit: "year" });
      }
      return addLeadingZeros(weekYear, token.length);
    },
    // ISO week-numbering year
    R: function(date, token) {
      const isoWeekYear = getISOWeekYear(date);
      return addLeadingZeros(isoWeekYear, token.length);
    },
    // Extended year. This is a single number designating the year of this calendar system.
    // The main difference between `y` and `u` localizers are B.C. years:
    // | Year | `y` | `u` |
    // |------|-----|-----|
    // | AC 1 |   1 |   1 |
    // | BC 1 |   1 |   0 |
    // | BC 2 |   2 |  -1 |
    // Also `yy` always returns the last two digits of a year,
    // while `uu` pads single digit years to 2 characters and returns other years unchanged.
    u: function(date, token) {
      const year = date.getFullYear();
      return addLeadingZeros(year, token.length);
    },
    // Quarter
    Q: function(date, token, localize2) {
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      switch (token) {
        // 1, 2, 3, 4
        case "Q":
          return String(quarter);
        // 01, 02, 03, 04
        case "QQ":
          return addLeadingZeros(quarter, 2);
        // 1st, 2nd, 3rd, 4th
        case "Qo":
          return localize2.ordinalNumber(quarter, { unit: "quarter" });
        // Q1, Q2, Q3, Q4
        case "QQQ":
          return localize2.quarter(quarter, {
            width: "abbreviated",
            context: "formatting"
          });
        // 1, 2, 3, 4 (narrow quarter; could be not numerical)
        case "QQQQQ":
          return localize2.quarter(quarter, {
            width: "narrow",
            context: "formatting"
          });
        // 1st quarter, 2nd quarter, ...
        case "QQQQ":
        default:
          return localize2.quarter(quarter, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // Stand-alone quarter
    q: function(date, token, localize2) {
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      switch (token) {
        // 1, 2, 3, 4
        case "q":
          return String(quarter);
        // 01, 02, 03, 04
        case "qq":
          return addLeadingZeros(quarter, 2);
        // 1st, 2nd, 3rd, 4th
        case "qo":
          return localize2.ordinalNumber(quarter, { unit: "quarter" });
        // Q1, Q2, Q3, Q4
        case "qqq":
          return localize2.quarter(quarter, {
            width: "abbreviated",
            context: "standalone"
          });
        // 1, 2, 3, 4 (narrow quarter; could be not numerical)
        case "qqqqq":
          return localize2.quarter(quarter, {
            width: "narrow",
            context: "standalone"
          });
        // 1st quarter, 2nd quarter, ...
        case "qqqq":
        default:
          return localize2.quarter(quarter, {
            width: "wide",
            context: "standalone"
          });
      }
    },
    // Month
    M: function(date, token, localize2) {
      const month = date.getMonth();
      switch (token) {
        case "M":
        case "MM":
          return lightFormatters.M(date, token);
        // 1st, 2nd, ..., 12th
        case "Mo":
          return localize2.ordinalNumber(month + 1, { unit: "month" });
        // Jan, Feb, ..., Dec
        case "MMM":
          return localize2.month(month, {
            width: "abbreviated",
            context: "formatting"
          });
        // J, F, ..., D
        case "MMMMM":
          return localize2.month(month, {
            width: "narrow",
            context: "formatting"
          });
        // January, February, ..., December
        case "MMMM":
        default:
          return localize2.month(month, { width: "wide", context: "formatting" });
      }
    },
    // Stand-alone month
    L: function(date, token, localize2) {
      const month = date.getMonth();
      switch (token) {
        // 1, 2, ..., 12
        case "L":
          return String(month + 1);
        // 01, 02, ..., 12
        case "LL":
          return addLeadingZeros(month + 1, 2);
        // 1st, 2nd, ..., 12th
        case "Lo":
          return localize2.ordinalNumber(month + 1, { unit: "month" });
        // Jan, Feb, ..., Dec
        case "LLL":
          return localize2.month(month, {
            width: "abbreviated",
            context: "standalone"
          });
        // J, F, ..., D
        case "LLLLL":
          return localize2.month(month, {
            width: "narrow",
            context: "standalone"
          });
        // January, February, ..., December
        case "LLLL":
        default:
          return localize2.month(month, { width: "wide", context: "standalone" });
      }
    },
    // Local week of year
    w: function(date, token, localize2, options2) {
      const week = getWeek(date, options2);
      if (token === "wo") {
        return localize2.ordinalNumber(week, { unit: "week" });
      }
      return addLeadingZeros(week, token.length);
    },
    // ISO week of year
    I: function(date, token, localize2) {
      const isoWeek = getISOWeek(date);
      if (token === "Io") {
        return localize2.ordinalNumber(isoWeek, { unit: "week" });
      }
      return addLeadingZeros(isoWeek, token.length);
    },
    // Day of the month
    d: function(date, token, localize2) {
      if (token === "do") {
        return localize2.ordinalNumber(date.getDate(), { unit: "date" });
      }
      return lightFormatters.d(date, token);
    },
    // Day of year
    D: function(date, token, localize2) {
      const dayOfYear = getDayOfYear(date);
      if (token === "Do") {
        return localize2.ordinalNumber(dayOfYear, { unit: "dayOfYear" });
      }
      return addLeadingZeros(dayOfYear, token.length);
    },
    // Day of week
    E: function(date, token, localize2) {
      const dayOfWeek = date.getDay();
      switch (token) {
        // Tue
        case "E":
        case "EE":
        case "EEE":
          return localize2.day(dayOfWeek, {
            width: "abbreviated",
            context: "formatting"
          });
        // T
        case "EEEEE":
          return localize2.day(dayOfWeek, {
            width: "narrow",
            context: "formatting"
          });
        // Tu
        case "EEEEEE":
          return localize2.day(dayOfWeek, {
            width: "short",
            context: "formatting"
          });
        // Tuesday
        case "EEEE":
        default:
          return localize2.day(dayOfWeek, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // Local day of week
    e: function(date, token, localize2, options2) {
      const dayOfWeek = date.getDay();
      const localDayOfWeek = (dayOfWeek - options2.weekStartsOn + 8) % 7 || 7;
      switch (token) {
        // Numerical value (Nth day of week with current locale or weekStartsOn)
        case "e":
          return String(localDayOfWeek);
        // Padded numerical value
        case "ee":
          return addLeadingZeros(localDayOfWeek, 2);
        // 1st, 2nd, ..., 7th
        case "eo":
          return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
        case "eee":
          return localize2.day(dayOfWeek, {
            width: "abbreviated",
            context: "formatting"
          });
        // T
        case "eeeee":
          return localize2.day(dayOfWeek, {
            width: "narrow",
            context: "formatting"
          });
        // Tu
        case "eeeeee":
          return localize2.day(dayOfWeek, {
            width: "short",
            context: "formatting"
          });
        // Tuesday
        case "eeee":
        default:
          return localize2.day(dayOfWeek, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // Stand-alone local day of week
    c: function(date, token, localize2, options2) {
      const dayOfWeek = date.getDay();
      const localDayOfWeek = (dayOfWeek - options2.weekStartsOn + 8) % 7 || 7;
      switch (token) {
        // Numerical value (same as in `e`)
        case "c":
          return String(localDayOfWeek);
        // Padded numerical value
        case "cc":
          return addLeadingZeros(localDayOfWeek, token.length);
        // 1st, 2nd, ..., 7th
        case "co":
          return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
        case "ccc":
          return localize2.day(dayOfWeek, {
            width: "abbreviated",
            context: "standalone"
          });
        // T
        case "ccccc":
          return localize2.day(dayOfWeek, {
            width: "narrow",
            context: "standalone"
          });
        // Tu
        case "cccccc":
          return localize2.day(dayOfWeek, {
            width: "short",
            context: "standalone"
          });
        // Tuesday
        case "cccc":
        default:
          return localize2.day(dayOfWeek, {
            width: "wide",
            context: "standalone"
          });
      }
    },
    // ISO day of week
    i: function(date, token, localize2) {
      const dayOfWeek = date.getDay();
      const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      switch (token) {
        // 2
        case "i":
          return String(isoDayOfWeek);
        // 02
        case "ii":
          return addLeadingZeros(isoDayOfWeek, token.length);
        // 2nd
        case "io":
          return localize2.ordinalNumber(isoDayOfWeek, { unit: "day" });
        // Tue
        case "iii":
          return localize2.day(dayOfWeek, {
            width: "abbreviated",
            context: "formatting"
          });
        // T
        case "iiiii":
          return localize2.day(dayOfWeek, {
            width: "narrow",
            context: "formatting"
          });
        // Tu
        case "iiiiii":
          return localize2.day(dayOfWeek, {
            width: "short",
            context: "formatting"
          });
        // Tuesday
        case "iiii":
        default:
          return localize2.day(dayOfWeek, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // AM or PM
    a: function(date, token, localize2) {
      const hours = date.getHours();
      const dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
      switch (token) {
        case "a":
        case "aa":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "abbreviated",
            context: "formatting"
          });
        case "aaa":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "abbreviated",
            context: "formatting"
          }).toLowerCase();
        case "aaaaa":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "narrow",
            context: "formatting"
          });
        case "aaaa":
        default:
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // AM, PM, midnight, noon
    b: function(date, token, localize2) {
      const hours = date.getHours();
      let dayPeriodEnumValue;
      if (hours === 12) {
        dayPeriodEnumValue = dayPeriodEnum.noon;
      } else if (hours === 0) {
        dayPeriodEnumValue = dayPeriodEnum.midnight;
      } else {
        dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
      }
      switch (token) {
        case "b":
        case "bb":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "abbreviated",
            context: "formatting"
          });
        case "bbb":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "abbreviated",
            context: "formatting"
          }).toLowerCase();
        case "bbbbb":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "narrow",
            context: "formatting"
          });
        case "bbbb":
        default:
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // in the morning, in the afternoon, in the evening, at night
    B: function(date, token, localize2) {
      const hours = date.getHours();
      let dayPeriodEnumValue;
      if (hours >= 17) {
        dayPeriodEnumValue = dayPeriodEnum.evening;
      } else if (hours >= 12) {
        dayPeriodEnumValue = dayPeriodEnum.afternoon;
      } else if (hours >= 4) {
        dayPeriodEnumValue = dayPeriodEnum.morning;
      } else {
        dayPeriodEnumValue = dayPeriodEnum.night;
      }
      switch (token) {
        case "B":
        case "BB":
        case "BBB":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "abbreviated",
            context: "formatting"
          });
        case "BBBBB":
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "narrow",
            context: "formatting"
          });
        case "BBBB":
        default:
          return localize2.dayPeriod(dayPeriodEnumValue, {
            width: "wide",
            context: "formatting"
          });
      }
    },
    // Hour [1-12]
    h: function(date, token, localize2) {
      if (token === "ho") {
        let hours = date.getHours() % 12;
        if (hours === 0) hours = 12;
        return localize2.ordinalNumber(hours, { unit: "hour" });
      }
      return lightFormatters.h(date, token);
    },
    // Hour [0-23]
    H: function(date, token, localize2) {
      if (token === "Ho") {
        return localize2.ordinalNumber(date.getHours(), { unit: "hour" });
      }
      return lightFormatters.H(date, token);
    },
    // Hour [0-11]
    K: function(date, token, localize2) {
      const hours = date.getHours() % 12;
      if (token === "Ko") {
        return localize2.ordinalNumber(hours, { unit: "hour" });
      }
      return addLeadingZeros(hours, token.length);
    },
    // Hour [1-24]
    k: function(date, token, localize2) {
      let hours = date.getHours();
      if (hours === 0) hours = 24;
      if (token === "ko") {
        return localize2.ordinalNumber(hours, { unit: "hour" });
      }
      return addLeadingZeros(hours, token.length);
    },
    // Minute
    m: function(date, token, localize2) {
      if (token === "mo") {
        return localize2.ordinalNumber(date.getMinutes(), { unit: "minute" });
      }
      return lightFormatters.m(date, token);
    },
    // Second
    s: function(date, token, localize2) {
      if (token === "so") {
        return localize2.ordinalNumber(date.getSeconds(), { unit: "second" });
      }
      return lightFormatters.s(date, token);
    },
    // Fraction of second
    S: function(date, token) {
      return lightFormatters.S(date, token);
    },
    // Timezone (ISO-8601. If offset is 0, output is always `'Z'`)
    X: function(date, token, _localize) {
      const timezoneOffset = date.getTimezoneOffset();
      if (timezoneOffset === 0) {
        return "Z";
      }
      switch (token) {
        // Hours and optional minutes
        case "X":
          return formatTimezoneWithOptionalMinutes(timezoneOffset);
        // Hours, minutes and optional seconds without `:` delimiter
        // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
        // so this token always has the same output as `XX`
        case "XXXX":
        case "XX":
          return formatTimezone(timezoneOffset);
        // Hours, minutes and optional seconds with `:` delimiter
        // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
        // so this token always has the same output as `XXX`
        case "XXXXX":
        case "XXX":
        // Hours and minutes with `:` delimiter
        default:
          return formatTimezone(timezoneOffset, ":");
      }
    },
    // Timezone (ISO-8601. If offset is 0, output is `'+00:00'` or equivalent)
    x: function(date, token, _localize) {
      const timezoneOffset = date.getTimezoneOffset();
      switch (token) {
        // Hours and optional minutes
        case "x":
          return formatTimezoneWithOptionalMinutes(timezoneOffset);
        // Hours, minutes and optional seconds without `:` delimiter
        // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
        // so this token always has the same output as `xx`
        case "xxxx":
        case "xx":
          return formatTimezone(timezoneOffset);
        // Hours, minutes and optional seconds with `:` delimiter
        // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
        // so this token always has the same output as `xxx`
        case "xxxxx":
        case "xxx":
        // Hours and minutes with `:` delimiter
        default:
          return formatTimezone(timezoneOffset, ":");
      }
    },
    // Timezone (GMT)
    O: function(date, token, _localize) {
      const timezoneOffset = date.getTimezoneOffset();
      switch (token) {
        // Short
        case "O":
        case "OO":
        case "OOO":
          return "GMT" + formatTimezoneShort(timezoneOffset, ":");
        // Long
        case "OOOO":
        default:
          return "GMT" + formatTimezone(timezoneOffset, ":");
      }
    },
    // Timezone (specific non-location)
    z: function(date, token, _localize) {
      const timezoneOffset = date.getTimezoneOffset();
      switch (token) {
        // Short
        case "z":
        case "zz":
        case "zzz":
          return "GMT" + formatTimezoneShort(timezoneOffset, ":");
        // Long
        case "zzzz":
        default:
          return "GMT" + formatTimezone(timezoneOffset, ":");
      }
    },
    // Seconds timestamp
    t: function(date, token, _localize) {
      const timestamp = Math.trunc(+date / 1e3);
      return addLeadingZeros(timestamp, token.length);
    },
    // Milliseconds timestamp
    T: function(date, token, _localize) {
      return addLeadingZeros(+date, token.length);
    }
  };
  function formatTimezoneShort(offset4, delimiter = "") {
    const sign = offset4 > 0 ? "-" : "+";
    const absOffset = Math.abs(offset4);
    const hours = Math.trunc(absOffset / 60);
    const minutes = absOffset % 60;
    if (minutes === 0) {
      return sign + String(hours);
    }
    return sign + String(hours) + delimiter + addLeadingZeros(minutes, 2);
  }
  function formatTimezoneWithOptionalMinutes(offset4, delimiter) {
    if (offset4 % 60 === 0) {
      const sign = offset4 > 0 ? "-" : "+";
      return sign + addLeadingZeros(Math.abs(offset4) / 60, 2);
    }
    return formatTimezone(offset4, delimiter);
  }
  function formatTimezone(offset4, delimiter = "") {
    const sign = offset4 > 0 ? "-" : "+";
    const absOffset = Math.abs(offset4);
    const hours = addLeadingZeros(Math.trunc(absOffset / 60), 2);
    const minutes = addLeadingZeros(absOffset % 60, 2);
    return sign + hours + delimiter + minutes;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/format/longFormatters.js
  init_define_import_meta_env();
  var dateLongFormatter = (pattern, formatLong2) => {
    switch (pattern) {
      case "P":
        return formatLong2.date({ width: "short" });
      case "PP":
        return formatLong2.date({ width: "medium" });
      case "PPP":
        return formatLong2.date({ width: "long" });
      case "PPPP":
      default:
        return formatLong2.date({ width: "full" });
    }
  };
  var timeLongFormatter = (pattern, formatLong2) => {
    switch (pattern) {
      case "p":
        return formatLong2.time({ width: "short" });
      case "pp":
        return formatLong2.time({ width: "medium" });
      case "ppp":
        return formatLong2.time({ width: "long" });
      case "pppp":
      default:
        return formatLong2.time({ width: "full" });
    }
  };
  var dateTimeLongFormatter = (pattern, formatLong2) => {
    const matchResult = pattern.match(/(P+)(p+)?/) || [];
    const datePattern = matchResult[1];
    const timePattern = matchResult[2];
    if (!timePattern) {
      return dateLongFormatter(pattern, formatLong2);
    }
    let dateTimeFormat;
    switch (datePattern) {
      case "P":
        dateTimeFormat = formatLong2.dateTime({ width: "short" });
        break;
      case "PP":
        dateTimeFormat = formatLong2.dateTime({ width: "medium" });
        break;
      case "PPP":
        dateTimeFormat = formatLong2.dateTime({ width: "long" });
        break;
      case "PPPP":
      default:
        dateTimeFormat = formatLong2.dateTime({ width: "full" });
        break;
    }
    return dateTimeFormat.replace("{{date}}", dateLongFormatter(datePattern, formatLong2)).replace("{{time}}", timeLongFormatter(timePattern, formatLong2));
  };
  var longFormatters = {
    p: timeLongFormatter,
    P: dateTimeLongFormatter
  };

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/_lib/protectedTokens.js
  init_define_import_meta_env();
  var dayOfYearTokenRE = /^D+$/;
  var weekYearTokenRE = /^Y+$/;
  var throwTokens = ["D", "DD", "YY", "YYYY"];
  function isProtectedDayOfYearToken(token) {
    return dayOfYearTokenRE.test(token);
  }
  function isProtectedWeekYearToken(token) {
    return weekYearTokenRE.test(token);
  }
  function warnOrThrowProtectedError(token, format2, input) {
    const _message = message(token, format2, input);
    console.warn(_message);
    if (throwTokens.includes(token)) throw new RangeError(_message);
  }
  function message(token, format2, input) {
    const subject = token[0] === "Y" ? "years" : "days of the month";
    return `Use \`${token.toLowerCase()}\` instead of \`${token}\` (in \`${format2}\`) for formatting ${subject} to the input \`${input}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/format.js
  var formattingTokensRegExp = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
  var longFormattingTokensRegExp = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
  var escapedStringRegExp = /^'([^]*?)'?$/;
  var doubleQuoteRegExp = /''/g;
  var unescapedLatinCharacterRegExp = /[a-zA-Z]/;
  function format(date, formatStr, options2) {
    const defaultOptions2 = getDefaultOptions();
    const locale = options2?.locale ?? defaultOptions2.locale ?? enUS;
    const firstWeekContainsDate = options2?.firstWeekContainsDate ?? options2?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
    const weekStartsOn = options2?.weekStartsOn ?? options2?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
    const originalDate = toDate(date, options2?.in);
    if (!isValid(originalDate)) {
      throw new RangeError("Invalid time value");
    }
    let parts = formatStr.match(longFormattingTokensRegExp).map((substring) => {
      const firstCharacter = substring[0];
      if (firstCharacter === "p" || firstCharacter === "P") {
        const longFormatter = longFormatters[firstCharacter];
        return longFormatter(substring, locale.formatLong);
      }
      return substring;
    }).join("").match(formattingTokensRegExp).map((substring) => {
      if (substring === "''") {
        return { isToken: false, value: "'" };
      }
      const firstCharacter = substring[0];
      if (firstCharacter === "'") {
        return { isToken: false, value: cleanEscapedString(substring) };
      }
      if (formatters[firstCharacter]) {
        return { isToken: true, value: substring };
      }
      if (firstCharacter.match(unescapedLatinCharacterRegExp)) {
        throw new RangeError(
          "Format string contains an unescaped latin alphabet character `" + firstCharacter + "`"
        );
      }
      return { isToken: false, value: substring };
    });
    if (locale.localize.preprocessor) {
      parts = locale.localize.preprocessor(originalDate, parts);
    }
    const formatterOptions = {
      firstWeekContainsDate,
      weekStartsOn,
      locale
    };
    return parts.map((part) => {
      if (!part.isToken) return part.value;
      const token = part.value;
      if (!options2?.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token) || !options2?.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) {
        warnOrThrowProtectedError(token, formatStr, String(date));
      }
      const formatter = formatters[token[0]];
      return formatter(originalDate, token, locale.localize, formatterOptions);
    }).join("");
  }
  function cleanEscapedString(input) {
    const matched = input.match(escapedStringRegExp);
    if (!matched) {
      return input;
    }
    return matched[1].replace(doubleQuoteRegExp, "'");
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getDaysInMonth.js
  init_define_import_meta_env();
  function getDaysInMonth(date, options2) {
    const _date = toDate(date, options2?.in);
    const year = _date.getFullYear();
    const monthIndex = _date.getMonth();
    const lastDayOfMonth = constructFrom(_date, 0);
    lastDayOfMonth.setFullYear(year, monthIndex + 1, 0);
    lastDayOfMonth.setHours(0, 0, 0, 0);
    return lastDayOfMonth.getDate();
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getMonth.js
  init_define_import_meta_env();
  function getMonth(date, options2) {
    return toDate(date, options2?.in).getMonth();
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/getYear.js
  init_define_import_meta_env();
  function getYear(date, options2) {
    return toDate(date, options2?.in).getFullYear();
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isAfter.js
  init_define_import_meta_env();
  function isAfter(date, dateToCompare) {
    return +toDate(date) > +toDate(dateToCompare);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isBefore.js
  init_define_import_meta_env();
  function isBefore(date, dateToCompare) {
    return +toDate(date) < +toDate(dateToCompare);
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isSameMonth.js
  init_define_import_meta_env();
  function isSameMonth(laterDate, earlierDate, options2) {
    const [laterDate_, earlierDate_] = normalizeDates(
      options2?.in,
      laterDate,
      earlierDate
    );
    return laterDate_.getFullYear() === earlierDate_.getFullYear() && laterDate_.getMonth() === earlierDate_.getMonth();
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/isSameYear.js
  init_define_import_meta_env();
  function isSameYear(laterDate, earlierDate, options2) {
    const [laterDate_, earlierDate_] = normalizeDates(
      options2?.in,
      laterDate,
      earlierDate
    );
    return laterDate_.getFullYear() === earlierDate_.getFullYear();
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/setMonth.js
  init_define_import_meta_env();
  function setMonth(date, month, options2) {
    const _date = toDate(date, options2?.in);
    const year = _date.getFullYear();
    const day = _date.getDate();
    const midMonth = constructFrom(options2?.in || date, 0);
    midMonth.setFullYear(year, month, 15);
    midMonth.setHours(0, 0, 0, 0);
    const daysInMonth = getDaysInMonth(midMonth);
    _date.setMonth(month, Math.min(day, daysInMonth));
    return _date;
  }

  // node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/setYear.js
  init_define_import_meta_env();
  function setYear(date, year, options2) {
    const date_ = toDate(date, options2?.in);
    if (isNaN(+date_)) return constructFrom(options2?.in || date, NaN);
    date_.setFullYear(year);
    return date_;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/endOfBroadcastWeek.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getBroadcastWeeksInMonth.js
  init_define_import_meta_env();
  var FIVE_WEEKS = 5;
  var FOUR_WEEKS = 4;
  function getBroadcastWeeksInMonth(month, dateLib) {
    const firstDayOfMonth = dateLib.startOfMonth(month);
    const firstDayOfWeek = firstDayOfMonth.getDay() > 0 ? firstDayOfMonth.getDay() : 7;
    const broadcastStartDate = dateLib.addDays(month, -firstDayOfWeek + 1);
    const lastDateOfLastWeek = dateLib.addDays(broadcastStartDate, FIVE_WEEKS * 7 - 1);
    const numberOfWeeks = dateLib.getMonth(month) === dateLib.getMonth(lastDateOfLastWeek) ? FIVE_WEEKS : FOUR_WEEKS;
    return numberOfWeeks;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/startOfBroadcastWeek.js
  init_define_import_meta_env();
  function startOfBroadcastWeek(date, dateLib) {
    const firstOfMonth = dateLib.startOfMonth(date);
    const dayOfWeek = firstOfMonth.getDay();
    if (dayOfWeek === 1) {
      return firstOfMonth;
    } else if (dayOfWeek === 0) {
      return dateLib.addDays(firstOfMonth, -1 * 6);
    } else {
      return dateLib.addDays(firstOfMonth, -1 * (dayOfWeek - 1));
    }
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/endOfBroadcastWeek.js
  function endOfBroadcastWeek(date, dateLib) {
    const startDate = startOfBroadcastWeek(date, dateLib);
    const numberOfWeeks = getBroadcastWeeksInMonth(date, dateLib);
    const endDate = dateLib.addDays(startDate, numberOfWeeks * 7 - 1);
    return endDate;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/locale/en-US.js
  init_define_import_meta_env();
  var enUS2 = {
    ...enUS,
    labels: {
      labelDayButton: (date, modifiers, options2, dateLib) => {
        let formatDate;
        if (dateLib && typeof dateLib.format === "function") {
          formatDate = dateLib.format.bind(dateLib);
        } else {
          formatDate = (d, pattern) => format(d, pattern, { locale: enUS, ...options2 });
        }
        let label = formatDate(date, "PPPP");
        if (modifiers.today)
          label = `Today, ${label}`;
        if (modifiers.selected)
          label = `${label}, selected`;
        return label;
      },
      labelMonthDropdown: "Choose the Month",
      labelNext: "Go to the Next Month",
      labelPrevious: "Go to the Previous Month",
      labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
      labelYearDropdown: "Choose the Year",
      labelGrid: (date, options2, dateLib) => {
        let formatDate;
        if (dateLib && typeof dateLib.format === "function") {
          formatDate = dateLib.format.bind(dateLib);
        } else {
          formatDate = (d, pattern) => format(d, pattern, { locale: enUS, ...options2 });
        }
        return formatDate(date, "LLLL yyyy");
      },
      labelGridcell: (date, modifiers, options2, dateLib) => {
        let formatDate;
        if (dateLib && typeof dateLib.format === "function") {
          formatDate = dateLib.format.bind(dateLib);
        } else {
          formatDate = (d, pattern) => format(d, pattern, { locale: enUS, ...options2 });
        }
        let label = formatDate(date, "PPPP");
        if (modifiers?.today) {
          label = `Today, ${label}`;
        }
        return label;
      },
      labelNav: "Navigation bar",
      labelWeekNumberHeader: "Week Number",
      labelWeekday: (date, options2, dateLib) => {
        let formatDate;
        if (dateLib && typeof dateLib.format === "function") {
          formatDate = dateLib.format.bind(dateLib);
        } else {
          formatDate = (d, pattern) => format(d, pattern, { locale: enUS, ...options2 });
        }
        return formatDate(date, "cccc");
      }
    }
  };

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/classes/DateLib.js
  var DateLib = class _DateLib {
    /**
     * Creates an instance of `DateLib`.
     *
     * @param options Configuration options for the date library.
     * @param overrides Custom overrides for the date library functions.
     */
    constructor(options2, overrides) {
      this.today = () => {
        if (this.overrides?.today) {
          return this.overrides.today();
        }
        if (this.options.timeZone) {
          return TZDate.tz(this.options.timeZone);
        }
        const DateCtor = this.options.Date ?? Date;
        return new DateCtor();
      };
      this.newDate = (year, monthIndex, date) => {
        if (this.overrides?.newDate) {
          return this.overrides.newDate(year, monthIndex, date);
        }
        if (this.options.timeZone) {
          return new TZDate(year, monthIndex, date, this.options.timeZone);
        }
        return new Date(year, monthIndex, date);
      };
      this.addDays = (date, amount) => {
        return this.overrides?.addDays ? this.overrides.addDays(date, amount) : addDays(date, amount);
      };
      this.addMonths = (date, amount) => {
        return this.overrides?.addMonths ? this.overrides.addMonths(date, amount) : addMonths(date, amount);
      };
      this.addWeeks = (date, amount) => {
        return this.overrides?.addWeeks ? this.overrides.addWeeks(date, amount) : addWeeks(date, amount);
      };
      this.addYears = (date, amount) => {
        return this.overrides?.addYears ? this.overrides.addYears(date, amount) : addYears(date, amount);
      };
      this.differenceInCalendarDays = (dateLeft, dateRight) => {
        return this.overrides?.differenceInCalendarDays ? this.overrides.differenceInCalendarDays(dateLeft, dateRight) : differenceInCalendarDays(dateLeft, dateRight);
      };
      this.differenceInCalendarMonths = (dateLeft, dateRight) => {
        return this.overrides?.differenceInCalendarMonths ? this.overrides.differenceInCalendarMonths(dateLeft, dateRight) : differenceInCalendarMonths(dateLeft, dateRight);
      };
      this.eachMonthOfInterval = (interval) => {
        return this.overrides?.eachMonthOfInterval ? this.overrides.eachMonthOfInterval(interval) : eachMonthOfInterval(interval);
      };
      this.eachYearOfInterval = (interval) => {
        const years = this.overrides?.eachYearOfInterval ? this.overrides.eachYearOfInterval(interval) : eachYearOfInterval(interval);
        const uniqueYears = new Set(years.map((d) => this.getYear(d)));
        if (uniqueYears.size === years.length) {
          return years;
        }
        const yearsArray = [];
        uniqueYears.forEach((y) => {
          yearsArray.push(new Date(y, 0, 1));
        });
        return yearsArray;
      };
      this.endOfBroadcastWeek = (date) => {
        return this.overrides?.endOfBroadcastWeek ? this.overrides.endOfBroadcastWeek(date) : endOfBroadcastWeek(date, this);
      };
      this.endOfISOWeek = (date) => {
        return this.overrides?.endOfISOWeek ? this.overrides.endOfISOWeek(date) : endOfISOWeek(date);
      };
      this.endOfMonth = (date) => {
        return this.overrides?.endOfMonth ? this.overrides.endOfMonth(date) : endOfMonth(date);
      };
      this.endOfWeek = (date, options3) => {
        return this.overrides?.endOfWeek ? this.overrides.endOfWeek(date, options3) : endOfWeek(date, this.options);
      };
      this.endOfYear = (date) => {
        return this.overrides?.endOfYear ? this.overrides.endOfYear(date) : endOfYear(date);
      };
      this.format = (date, formatStr, _options) => {
        const formatted = this.overrides?.format ? this.overrides.format(date, formatStr, this.options) : format(date, formatStr, this.options);
        if (this.options.numerals && this.options.numerals !== "latn") {
          return this.replaceDigits(formatted);
        }
        return formatted;
      };
      this.getISOWeek = (date) => {
        return this.overrides?.getISOWeek ? this.overrides.getISOWeek(date) : getISOWeek(date);
      };
      this.getMonth = (date, _options) => {
        return this.overrides?.getMonth ? this.overrides.getMonth(date, this.options) : getMonth(date, this.options);
      };
      this.getYear = (date, _options) => {
        return this.overrides?.getYear ? this.overrides.getYear(date, this.options) : getYear(date, this.options);
      };
      this.getWeek = (date, _options) => {
        return this.overrides?.getWeek ? this.overrides.getWeek(date, this.options) : getWeek(date, this.options);
      };
      this.isAfter = (date, dateToCompare) => {
        return this.overrides?.isAfter ? this.overrides.isAfter(date, dateToCompare) : isAfter(date, dateToCompare);
      };
      this.isBefore = (date, dateToCompare) => {
        return this.overrides?.isBefore ? this.overrides.isBefore(date, dateToCompare) : isBefore(date, dateToCompare);
      };
      this.isDate = (value) => {
        return this.overrides?.isDate ? this.overrides.isDate(value) : isDate(value);
      };
      this.isSameDay = (dateLeft, dateRight) => {
        return this.overrides?.isSameDay ? this.overrides.isSameDay(dateLeft, dateRight) : isSameDay(dateLeft, dateRight);
      };
      this.isSameMonth = (dateLeft, dateRight) => {
        return this.overrides?.isSameMonth ? this.overrides.isSameMonth(dateLeft, dateRight) : isSameMonth(dateLeft, dateRight);
      };
      this.isSameYear = (dateLeft, dateRight) => {
        return this.overrides?.isSameYear ? this.overrides.isSameYear(dateLeft, dateRight) : isSameYear(dateLeft, dateRight);
      };
      this.max = (dates) => {
        return this.overrides?.max ? this.overrides.max(dates) : max2(dates);
      };
      this.min = (dates) => {
        return this.overrides?.min ? this.overrides.min(dates) : min2(dates);
      };
      this.setMonth = (date, month) => {
        return this.overrides?.setMonth ? this.overrides.setMonth(date, month) : setMonth(date, month);
      };
      this.setYear = (date, year) => {
        return this.overrides?.setYear ? this.overrides.setYear(date, year) : setYear(date, year);
      };
      this.startOfBroadcastWeek = (date, _dateLib) => {
        return this.overrides?.startOfBroadcastWeek ? this.overrides.startOfBroadcastWeek(date, this) : startOfBroadcastWeek(date, this);
      };
      this.startOfDay = (date) => {
        return this.overrides?.startOfDay ? this.overrides.startOfDay(date) : startOfDay(date);
      };
      this.startOfISOWeek = (date) => {
        return this.overrides?.startOfISOWeek ? this.overrides.startOfISOWeek(date) : startOfISOWeek(date);
      };
      this.startOfMonth = (date) => {
        return this.overrides?.startOfMonth ? this.overrides.startOfMonth(date) : startOfMonth(date);
      };
      this.startOfWeek = (date, _options) => {
        return this.overrides?.startOfWeek ? this.overrides.startOfWeek(date, this.options) : startOfWeek(date, this.options);
      };
      this.startOfYear = (date) => {
        return this.overrides?.startOfYear ? this.overrides.startOfYear(date) : startOfYear(date);
      };
      this.options = { locale: enUS2, ...options2 };
      this.overrides = overrides;
    }
    /**
     * Generates a mapping of Arabic digits (0-9) to the target numbering system
     * digits.
     *
     * @since 9.5.0
     * @returns A record mapping Arabic digits to the target numerals.
     */
    getDigitMap() {
      const { numerals = "latn" } = this.options;
      const formatter = new Intl.NumberFormat("en-US", {
        numberingSystem: numerals
      });
      const digitMap = {};
      for (let i = 0; i < 10; i++) {
        digitMap[i.toString()] = formatter.format(i);
      }
      return digitMap;
    }
    /**
     * Replaces Arabic digits in a string with the target numbering system digits.
     *
     * @since 9.5.0
     * @param input The string containing Arabic digits.
     * @returns The string with digits replaced.
     */
    replaceDigits(input) {
      const digitMap = this.getDigitMap();
      return input.replace(/\d/g, (digit) => digitMap[digit] || digit);
    }
    /**
     * Formats a number using the configured numbering system.
     *
     * @since 9.5.0
     * @param value The number to format.
     * @returns The formatted number as a string.
     */
    formatNumber(value) {
      return this.replaceDigits(value.toString());
    }
    /**
     * Returns the preferred ordering for month and year labels for the current
     * locale.
     */
    getMonthYearOrder() {
      const code = this.options.locale?.code;
      if (!code) {
        return "month-first";
      }
      return _DateLib.yearFirstLocales.has(code) ? "year-first" : "month-first";
    }
    /**
     * Formats the month/year pair respecting locale conventions.
     *
     * @since 9.11.0
     */
    formatMonthYear(date) {
      const { locale, timeZone, numerals } = this.options;
      const localeCode = locale?.code;
      if (localeCode && _DateLib.yearFirstLocales.has(localeCode)) {
        try {
          const intl = new Intl.DateTimeFormat(localeCode, {
            month: "long",
            year: "numeric",
            timeZone,
            numberingSystem: numerals
          });
          const formatted = intl.format(date);
          return formatted;
        } catch {
        }
      }
      const pattern = this.getMonthYearOrder() === "year-first" ? "y LLLL" : "LLLL y";
      return this.format(date, pattern);
    }
  };
  DateLib.yearFirstLocales = /* @__PURE__ */ new Set([
    "eu",
    "hu",
    "ja",
    "ja-Hira",
    "ja-JP",
    "ko",
    "ko-KR",
    "lt",
    "lt-LT",
    "lv",
    "lv-LV",
    "mn",
    "mn-MN",
    "zh",
    "zh-CN",
    "zh-HK",
    "zh-TW"
  ]);
  var defaultDateLib = new DateLib();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/classes/CalendarDay.js
  var CalendarDay = class {
    constructor(date, displayMonth, dateLib = defaultDateLib) {
      this.date = date;
      this.displayMonth = displayMonth;
      this.outside = Boolean(displayMonth && !dateLib.isSameMonth(date, displayMonth));
      this.dateLib = dateLib;
      this.isoDate = dateLib.format(date, "yyyy-MM-dd");
      this.displayMonthId = dateLib.format(displayMonth, "yyyy-MM");
      this.dateMonthId = dateLib.format(date, "yyyy-MM");
    }
    /**
     * Checks if this day is equal to another `CalendarDay`, considering both the
     * date and the displayed month.
     *
     * @param day The `CalendarDay` to compare with.
     * @returns `true` if the days are equal, otherwise `false`.
     */
    isEqualTo(day) {
      return this.dateLib.isSameDay(day.date, this.date) && this.dateLib.isSameMonth(day.displayMonth, this.displayMonth);
    }
  };

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/classes/CalendarMonth.js
  init_define_import_meta_env();
  var CalendarMonth = class {
    constructor(month, weeks) {
      this.date = month;
      this.weeks = weeks;
    }
  };

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/classes/CalendarWeek.js
  init_define_import_meta_env();
  var CalendarWeek = class {
    constructor(weekNumber, days) {
      this.days = days;
      this.weekNumber = weekNumber;
    }
  };

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/custom-components.js
  var custom_components_exports = {};
  __export(custom_components_exports, {
    CaptionLabel: () => CaptionLabel,
    Chevron: () => Chevron,
    Day: () => Day,
    DayButton: () => DayButton,
    Dropdown: () => Dropdown,
    DropdownNav: () => DropdownNav,
    Footer: () => Footer,
    Month: () => Month,
    MonthCaption: () => MonthCaption,
    MonthGrid: () => MonthGrid,
    Months: () => Months,
    MonthsDropdown: () => MonthsDropdown,
    Nav: () => Nav,
    NextMonthButton: () => NextMonthButton,
    Option: () => Option,
    PreviousMonthButton: () => PreviousMonthButton,
    Root: () => Root5,
    Select: () => Select2,
    Week: () => Week,
    WeekNumber: () => WeekNumber,
    WeekNumberHeader: () => WeekNumberHeader,
    Weekday: () => Weekday,
    Weekdays: () => Weekdays,
    Weeks: () => Weeks,
    YearsDropdown: () => YearsDropdown
  });
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/CaptionLabel.js
  init_define_import_meta_env();
  var import_react3 = __toESM(require_react_shim(), 1);
  function CaptionLabel(props) {
    return import_react3.default.createElement("span", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Chevron.js
  init_define_import_meta_env();
  var import_react4 = __toESM(require_react_shim(), 1);
  function Chevron(props) {
    const { size: size4 = 24, orientation = "left", className, style } = props;
    return import_react4.default.createElement(
      "svg",
      { className, style, width: size4, height: size4, viewBox: "0 0 24 24" },
      orientation === "up" && import_react4.default.createElement("polygon", { points: "6.77 17 12.5 11.43 18.24 17 20 15.28 12.5 8 5 15.28" }),
      orientation === "down" && import_react4.default.createElement("polygon", { points: "6.77 8 12.5 13.57 18.24 8 20 9.72 12.5 17 5 9.72" }),
      orientation === "left" && import_react4.default.createElement("polygon", { points: "16 18.112 9.81111111 12 16 5.87733333 14.0888889 4 6 12 14.0888889 20" }),
      orientation === "right" && import_react4.default.createElement("polygon", { points: "8 18.112 14.18888889 12 8 5.87733333 9.91111111 4 18 12 9.91111111 20" })
    );
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Day.js
  init_define_import_meta_env();
  var import_react5 = __toESM(require_react_shim(), 1);
  function Day(props) {
    const { day, modifiers, ...tdProps } = props;
    return import_react5.default.createElement("td", { ...tdProps });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/DayButton.js
  init_define_import_meta_env();
  var import_react6 = __toESM(require_react_shim(), 1);
  function DayButton(props) {
    const { day, modifiers, ...buttonProps } = props;
    const ref = import_react6.default.useRef(null);
    import_react6.default.useEffect(() => {
      if (modifiers.focused)
        ref.current?.focus();
    }, [modifiers.focused]);
    return import_react6.default.createElement("button", { ref, ...buttonProps });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Dropdown.js
  init_define_import_meta_env();
  var import_react8 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/UI.js
  init_define_import_meta_env();
  var UI;
  (function(UI2) {
    UI2["Root"] = "root";
    UI2["Chevron"] = "chevron";
    UI2["Day"] = "day";
    UI2["DayButton"] = "day_button";
    UI2["CaptionLabel"] = "caption_label";
    UI2["Dropdowns"] = "dropdowns";
    UI2["Dropdown"] = "dropdown";
    UI2["DropdownRoot"] = "dropdown_root";
    UI2["Footer"] = "footer";
    UI2["MonthGrid"] = "month_grid";
    UI2["MonthCaption"] = "month_caption";
    UI2["MonthsDropdown"] = "months_dropdown";
    UI2["Month"] = "month";
    UI2["Months"] = "months";
    UI2["Nav"] = "nav";
    UI2["NextMonthButton"] = "button_next";
    UI2["PreviousMonthButton"] = "button_previous";
    UI2["Week"] = "week";
    UI2["Weeks"] = "weeks";
    UI2["Weekday"] = "weekday";
    UI2["Weekdays"] = "weekdays";
    UI2["WeekNumber"] = "week_number";
    UI2["WeekNumberHeader"] = "week_number_header";
    UI2["YearsDropdown"] = "years_dropdown";
  })(UI || (UI = {}));
  var DayFlag;
  (function(DayFlag2) {
    DayFlag2["disabled"] = "disabled";
    DayFlag2["hidden"] = "hidden";
    DayFlag2["outside"] = "outside";
    DayFlag2["focused"] = "focused";
    DayFlag2["today"] = "today";
  })(DayFlag || (DayFlag = {}));
  var SelectionState;
  (function(SelectionState2) {
    SelectionState2["range_end"] = "range_end";
    SelectionState2["range_middle"] = "range_middle";
    SelectionState2["range_start"] = "range_start";
    SelectionState2["selected"] = "selected";
  })(SelectionState || (SelectionState = {}));
  var Animation;
  (function(Animation2) {
    Animation2["weeks_before_enter"] = "weeks_before_enter";
    Animation2["weeks_before_exit"] = "weeks_before_exit";
    Animation2["weeks_after_enter"] = "weeks_after_enter";
    Animation2["weeks_after_exit"] = "weeks_after_exit";
    Animation2["caption_after_enter"] = "caption_after_enter";
    Animation2["caption_after_exit"] = "caption_after_exit";
    Animation2["caption_before_enter"] = "caption_before_enter";
    Animation2["caption_before_exit"] = "caption_before_exit";
  })(Animation || (Animation = {}));

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useDayPicker.js
  init_define_import_meta_env();
  var import_react7 = __toESM(require_react_shim(), 1);
  var dayPickerContext = (0, import_react7.createContext)(void 0);
  function useDayPicker() {
    const context = (0, import_react7.useContext)(dayPickerContext);
    if (context === void 0) {
      throw new Error("useDayPicker() must be used within a custom component.");
    }
    return context;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Dropdown.js
  function Dropdown(props) {
    const { options: options2, className, ...selectProps } = props;
    const { classNames, components, styles } = useDayPicker();
    const cssClassSelect = [classNames[UI.Dropdown], className].join(" ");
    const selectedOption = options2?.find(({ value }) => value === selectProps.value);
    return import_react8.default.createElement(
      "span",
      { "data-disabled": selectProps.disabled, className: classNames[UI.DropdownRoot], style: styles?.[UI.DropdownRoot] },
      import_react8.default.createElement(components.Select, { className: cssClassSelect, ...selectProps }, options2?.map(({ value, label, disabled }) => import_react8.default.createElement(components.Option, { key: value, value, disabled }, label))),
      import_react8.default.createElement(
        "span",
        { className: classNames[UI.CaptionLabel], style: styles?.[UI.CaptionLabel], "aria-hidden": true },
        selectedOption?.label,
        import_react8.default.createElement(components.Chevron, { orientation: "down", size: 18, className: classNames[UI.Chevron], style: styles?.[UI.Chevron] })
      )
    );
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/DropdownNav.js
  init_define_import_meta_env();
  var import_react9 = __toESM(require_react_shim(), 1);
  function DropdownNav(props) {
    return import_react9.default.createElement("div", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Footer.js
  init_define_import_meta_env();
  var import_react10 = __toESM(require_react_shim(), 1);
  function Footer(props) {
    return import_react10.default.createElement("div", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Month.js
  init_define_import_meta_env();
  var import_react11 = __toESM(require_react_shim(), 1);
  function Month(props) {
    const { calendarMonth, displayIndex, ...divProps } = props;
    return import_react11.default.createElement("div", { ...divProps }, props.children);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/MonthCaption.js
  init_define_import_meta_env();
  var import_react12 = __toESM(require_react_shim(), 1);
  function MonthCaption(props) {
    const { calendarMonth, displayIndex, ...divProps } = props;
    return import_react12.default.createElement("div", { ...divProps });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/MonthGrid.js
  init_define_import_meta_env();
  var import_react13 = __toESM(require_react_shim(), 1);
  function MonthGrid(props) {
    return import_react13.default.createElement("table", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Months.js
  init_define_import_meta_env();
  var import_react14 = __toESM(require_react_shim(), 1);
  function Months(props) {
    return import_react14.default.createElement("div", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/MonthsDropdown.js
  init_define_import_meta_env();
  var import_react15 = __toESM(require_react_shim(), 1);
  function MonthsDropdown(props) {
    const { components } = useDayPicker();
    return import_react15.default.createElement(components.Dropdown, { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Nav.js
  init_define_import_meta_env();
  var import_react16 = __toESM(require_react_shim(), 1);
  function Nav(props) {
    const { onPreviousClick, onNextClick, previousMonth, nextMonth, ...navProps } = props;
    const { components, classNames, styles, labels: { labelPrevious: labelPrevious2, labelNext: labelNext2 } } = useDayPicker();
    const handleNextClick = (0, import_react16.useCallback)((e) => {
      if (nextMonth) {
        onNextClick?.(e);
      }
    }, [nextMonth, onNextClick]);
    const handlePreviousClick = (0, import_react16.useCallback)((e) => {
      if (previousMonth) {
        onPreviousClick?.(e);
      }
    }, [previousMonth, onPreviousClick]);
    return import_react16.default.createElement(
      "nav",
      { ...navProps },
      import_react16.default.createElement(
        components.PreviousMonthButton,
        { type: "button", className: classNames[UI.PreviousMonthButton], style: styles?.[UI.PreviousMonthButton], tabIndex: previousMonth ? void 0 : -1, "aria-disabled": previousMonth ? void 0 : true, "aria-label": labelPrevious2(previousMonth), onClick: handlePreviousClick },
        import_react16.default.createElement(components.Chevron, { disabled: previousMonth ? void 0 : true, className: classNames[UI.Chevron], style: styles?.[UI.Chevron], orientation: "left" })
      ),
      import_react16.default.createElement(
        components.NextMonthButton,
        { type: "button", className: classNames[UI.NextMonthButton], style: styles?.[UI.NextMonthButton], tabIndex: nextMonth ? void 0 : -1, "aria-disabled": nextMonth ? void 0 : true, "aria-label": labelNext2(nextMonth), onClick: handleNextClick },
        import_react16.default.createElement(components.Chevron, { disabled: nextMonth ? void 0 : true, orientation: "right", className: classNames[UI.Chevron], style: styles?.[UI.Chevron] })
      )
    );
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/NextMonthButton.js
  init_define_import_meta_env();
  var import_react17 = __toESM(require_react_shim(), 1);
  function NextMonthButton(props) {
    return import_react17.default.createElement("button", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Option.js
  init_define_import_meta_env();
  var import_react18 = __toESM(require_react_shim(), 1);
  function Option(props) {
    return import_react18.default.createElement("option", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/PreviousMonthButton.js
  init_define_import_meta_env();
  var import_react19 = __toESM(require_react_shim(), 1);
  function PreviousMonthButton(props) {
    return import_react19.default.createElement("button", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Root.js
  init_define_import_meta_env();
  var import_react20 = __toESM(require_react_shim(), 1);
  function Root5(props) {
    const { rootRef, ...rest } = props;
    return import_react20.default.createElement("div", { ...rest, ref: rootRef });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Select.js
  init_define_import_meta_env();
  var import_react21 = __toESM(require_react_shim(), 1);
  function Select2(props) {
    return import_react21.default.createElement("select", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Week.js
  init_define_import_meta_env();
  var import_react22 = __toESM(require_react_shim(), 1);
  function Week(props) {
    const { week, ...trProps } = props;
    return import_react22.default.createElement("tr", { ...trProps });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Weekday.js
  init_define_import_meta_env();
  var import_react23 = __toESM(require_react_shim(), 1);
  function Weekday(props) {
    return import_react23.default.createElement("th", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Weekdays.js
  init_define_import_meta_env();
  var import_react24 = __toESM(require_react_shim(), 1);
  function Weekdays(props) {
    return import_react24.default.createElement(
      "thead",
      { "aria-hidden": true },
      import_react24.default.createElement("tr", { ...props })
    );
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/WeekNumber.js
  init_define_import_meta_env();
  var import_react25 = __toESM(require_react_shim(), 1);
  function WeekNumber(props) {
    const { week, ...thProps } = props;
    return import_react25.default.createElement("th", { ...thProps });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/WeekNumberHeader.js
  init_define_import_meta_env();
  var import_react26 = __toESM(require_react_shim(), 1);
  function WeekNumberHeader(props) {
    return import_react26.default.createElement("th", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/Weeks.js
  init_define_import_meta_env();
  var import_react27 = __toESM(require_react_shim(), 1);
  function Weeks(props) {
    return import_react27.default.createElement("tbody", { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/components/YearsDropdown.js
  init_define_import_meta_env();
  var import_react28 = __toESM(require_react_shim(), 1);
  function YearsDropdown(props) {
    const { components } = useDayPicker();
    return import_react28.default.createElement(components.Dropdown, { ...props });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/DayPicker.js
  init_define_import_meta_env();
  var import_react33 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/createGetModifiers.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/dateMatchModifiers.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/rangeIncludesDate.js
  init_define_import_meta_env();
  function rangeIncludesDate(range, date, excludeEnds = false, dateLib = defaultDateLib) {
    let { from, to } = range;
    const { differenceInCalendarDays: differenceInCalendarDays2, isSameDay: isSameDay2 } = dateLib;
    if (from && to) {
      const isRangeInverted = differenceInCalendarDays2(to, from) < 0;
      if (isRangeInverted) {
        [from, to] = [to, from];
      }
      const isInRange = differenceInCalendarDays2(date, from) >= (excludeEnds ? 1 : 0) && differenceInCalendarDays2(to, date) >= (excludeEnds ? 1 : 0);
      return isInRange;
    }
    if (!excludeEnds && to) {
      return isSameDay2(to, date);
    }
    if (!excludeEnds && from) {
      return isSameDay2(from, date);
    }
    return false;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/typeguards.js
  init_define_import_meta_env();
  function isDateInterval(matcher) {
    return Boolean(matcher && typeof matcher === "object" && "before" in matcher && "after" in matcher);
  }
  function isDateRange(value) {
    return Boolean(value && typeof value === "object" && "from" in value);
  }
  function isDateAfterType(value) {
    return Boolean(value && typeof value === "object" && "after" in value);
  }
  function isDateBeforeType(value) {
    return Boolean(value && typeof value === "object" && "before" in value);
  }
  function isDayOfWeekType(value) {
    return Boolean(value && typeof value === "object" && "dayOfWeek" in value);
  }
  function isDatesArray(value, dateLib) {
    return Array.isArray(value) && value.every(dateLib.isDate);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/dateMatchModifiers.js
  function dateMatchModifiers(date, matchers, dateLib = defaultDateLib) {
    const matchersArr = !Array.isArray(matchers) ? [matchers] : matchers;
    const { isSameDay: isSameDay2, differenceInCalendarDays: differenceInCalendarDays2, isAfter: isAfter2 } = dateLib;
    return matchersArr.some((matcher) => {
      if (typeof matcher === "boolean") {
        return matcher;
      }
      if (dateLib.isDate(matcher)) {
        return isSameDay2(date, matcher);
      }
      if (isDatesArray(matcher, dateLib)) {
        return matcher.some((matcherDate) => isSameDay2(date, matcherDate));
      }
      if (isDateRange(matcher)) {
        return rangeIncludesDate(matcher, date, false, dateLib);
      }
      if (isDayOfWeekType(matcher)) {
        if (!Array.isArray(matcher.dayOfWeek)) {
          return matcher.dayOfWeek === date.getDay();
        }
        return matcher.dayOfWeek.includes(date.getDay());
      }
      if (isDateInterval(matcher)) {
        const diffBefore = differenceInCalendarDays2(matcher.before, date);
        const diffAfter = differenceInCalendarDays2(matcher.after, date);
        const isDayBefore = diffBefore > 0;
        const isDayAfter = diffAfter < 0;
        const isClosedInterval = isAfter2(matcher.before, matcher.after);
        if (isClosedInterval) {
          return isDayAfter && isDayBefore;
        } else {
          return isDayBefore || isDayAfter;
        }
      }
      if (isDateAfterType(matcher)) {
        return differenceInCalendarDays2(date, matcher.after) > 0;
      }
      if (isDateBeforeType(matcher)) {
        return differenceInCalendarDays2(matcher.before, date) > 0;
      }
      if (typeof matcher === "function") {
        return matcher(date);
      }
      return false;
    });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/createGetModifiers.js
  function createGetModifiers(days, props, navStart, navEnd, dateLib) {
    const { disabled, hidden, modifiers, showOutsideDays, broadcastCalendar, today = dateLib.today() } = props;
    const { isSameDay: isSameDay2, isSameMonth: isSameMonth2, startOfMonth: startOfMonth2, isBefore: isBefore2, endOfMonth: endOfMonth2, isAfter: isAfter2 } = dateLib;
    const computedNavStart = navStart && startOfMonth2(navStart);
    const computedNavEnd = navEnd && endOfMonth2(navEnd);
    const internalModifiersMap = {
      [DayFlag.focused]: [],
      [DayFlag.outside]: [],
      [DayFlag.disabled]: [],
      [DayFlag.hidden]: [],
      [DayFlag.today]: []
    };
    const customModifiersMap = {};
    for (const day of days) {
      const { date, displayMonth } = day;
      const isOutside = Boolean(displayMonth && !isSameMonth2(date, displayMonth));
      const isBeforeNavStart = Boolean(computedNavStart && isBefore2(date, computedNavStart));
      const isAfterNavEnd = Boolean(computedNavEnd && isAfter2(date, computedNavEnd));
      const isDisabled = Boolean(disabled && dateMatchModifiers(date, disabled, dateLib));
      const isHidden2 = Boolean(hidden && dateMatchModifiers(date, hidden, dateLib)) || isBeforeNavStart || isAfterNavEnd || // Broadcast calendar will show outside days as default
      !broadcastCalendar && !showOutsideDays && isOutside || broadcastCalendar && showOutsideDays === false && isOutside;
      const isToday = isSameDay2(date, today);
      if (isOutside)
        internalModifiersMap.outside.push(day);
      if (isDisabled)
        internalModifiersMap.disabled.push(day);
      if (isHidden2)
        internalModifiersMap.hidden.push(day);
      if (isToday)
        internalModifiersMap.today.push(day);
      if (modifiers) {
        Object.keys(modifiers).forEach((name) => {
          const modifierValue = modifiers?.[name];
          const isMatch = modifierValue ? dateMatchModifiers(date, modifierValue, dateLib) : false;
          if (!isMatch)
            return;
          if (customModifiersMap[name]) {
            customModifiersMap[name].push(day);
          } else {
            customModifiersMap[name] = [day];
          }
        });
      }
    }
    return (day) => {
      const dayFlags = {
        [DayFlag.focused]: false,
        [DayFlag.disabled]: false,
        [DayFlag.hidden]: false,
        [DayFlag.outside]: false,
        [DayFlag.today]: false
      };
      const customModifiers = {};
      for (const name in internalModifiersMap) {
        const days2 = internalModifiersMap[name];
        dayFlags[name] = days2.some((d) => d === day);
      }
      for (const name in customModifiersMap) {
        customModifiers[name] = customModifiersMap[name].some((d) => d === day);
      }
      return {
        ...dayFlags,
        // custom modifiers should override all the previous ones
        ...customModifiers
      };
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getClassNamesForModifiers.js
  init_define_import_meta_env();
  function getClassNamesForModifiers(modifiers, classNames, modifiersClassNames = {}) {
    const modifierClassNames = Object.entries(modifiers).filter(([, active]) => active === true).reduce((previousValue, [key]) => {
      if (modifiersClassNames[key]) {
        previousValue.push(modifiersClassNames[key]);
      } else if (classNames[DayFlag[key]]) {
        previousValue.push(classNames[DayFlag[key]]);
      } else if (classNames[SelectionState[key]]) {
        previousValue.push(classNames[SelectionState[key]]);
      }
      return previousValue;
    }, [classNames[UI.Day]]);
    return modifierClassNames;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getComponents.js
  init_define_import_meta_env();
  function getComponents(customComponents) {
    return {
      ...custom_components_exports,
      ...customComponents
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getDataAttributes.js
  init_define_import_meta_env();
  function getDataAttributes(props) {
    const dataAttributes = {
      "data-mode": props.mode ?? void 0,
      "data-required": "required" in props ? props.required : void 0,
      "data-multiple-months": props.numberOfMonths && props.numberOfMonths > 1 || void 0,
      "data-week-numbers": props.showWeekNumber || void 0,
      "data-broadcast-calendar": props.broadcastCalendar || void 0,
      "data-nav-layout": props.navLayout || void 0
    };
    Object.entries(props).forEach(([key, val]) => {
      if (key.startsWith("data-")) {
        dataAttributes[key] = val;
      }
    });
    return dataAttributes;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getDefaultClassNames.js
  init_define_import_meta_env();
  function getDefaultClassNames() {
    const classNames = {};
    for (const key in UI) {
      classNames[UI[key]] = `rdp-${UI[key]}`;
    }
    for (const key in DayFlag) {
      classNames[DayFlag[key]] = `rdp-${DayFlag[key]}`;
    }
    for (const key in SelectionState) {
      classNames[SelectionState[key]] = `rdp-${SelectionState[key]}`;
    }
    for (const key in Animation) {
      classNames[Animation[key]] = `rdp-${Animation[key]}`;
    }
    return classNames;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getFormatters.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/index.js
  var formatters_exports = {};
  __export(formatters_exports, {
    formatCaption: () => formatCaption,
    formatDay: () => formatDay,
    formatMonthDropdown: () => formatMonthDropdown,
    formatWeekNumber: () => formatWeekNumber,
    formatWeekNumberHeader: () => formatWeekNumberHeader,
    formatWeekdayName: () => formatWeekdayName,
    formatYearDropdown: () => formatYearDropdown
  });
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatCaption.js
  init_define_import_meta_env();
  function formatCaption(month, options2, dateLib) {
    const lib = dateLib ?? new DateLib(options2);
    return lib.formatMonthYear(month);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatDay.js
  init_define_import_meta_env();
  function formatDay(date, options2, dateLib) {
    return (dateLib ?? new DateLib(options2)).format(date, "d");
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatMonthDropdown.js
  init_define_import_meta_env();
  function formatMonthDropdown(month, dateLib = defaultDateLib) {
    return dateLib.format(month, "LLLL");
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatWeekdayName.js
  init_define_import_meta_env();
  function formatWeekdayName(weekday, options2, dateLib) {
    return (dateLib ?? new DateLib(options2)).format(weekday, "cccccc");
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatWeekNumber.js
  init_define_import_meta_env();
  function formatWeekNumber(weekNumber, dateLib = defaultDateLib) {
    if (weekNumber < 10) {
      return dateLib.formatNumber(`0${weekNumber.toLocaleString()}`);
    }
    return dateLib.formatNumber(`${weekNumber.toLocaleString()}`);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatWeekNumberHeader.js
  init_define_import_meta_env();
  function formatWeekNumberHeader() {
    return ``;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/formatters/formatYearDropdown.js
  init_define_import_meta_env();
  function formatYearDropdown(year, dateLib = defaultDateLib) {
    return dateLib.format(year, "yyyy");
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getFormatters.js
  function getFormatters(customFormatters) {
    return {
      ...formatters_exports,
      ...customFormatters
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getLabels.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/index.js
  var labels_exports = {};
  __export(labels_exports, {
    labelDayButton: () => labelDayButton,
    labelGrid: () => labelGrid,
    labelGridcell: () => labelGridcell,
    labelMonthDropdown: () => labelMonthDropdown,
    labelNav: () => labelNav,
    labelNext: () => labelNext,
    labelPrevious: () => labelPrevious,
    labelWeekNumber: () => labelWeekNumber,
    labelWeekNumberHeader: () => labelWeekNumberHeader,
    labelWeekday: () => labelWeekday,
    labelYearDropdown: () => labelYearDropdown
  });
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelDayButton.js
  init_define_import_meta_env();
  function labelDayButton(date, modifiers, options2, dateLib) {
    let label = (dateLib ?? new DateLib(options2)).format(date, "PPPP");
    if (modifiers.today)
      label = `Today, ${label}`;
    if (modifiers.selected)
      label = `${label}, selected`;
    return label;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelGrid.js
  init_define_import_meta_env();
  function labelGrid(date, options2, dateLib) {
    const lib = dateLib ?? new DateLib(options2);
    return lib.formatMonthYear(date);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelGridcell.js
  init_define_import_meta_env();
  function labelGridcell(date, modifiers, options2, dateLib) {
    let label = (dateLib ?? new DateLib(options2)).format(date, "PPPP");
    if (modifiers?.today) {
      label = `Today, ${label}`;
    }
    return label;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelMonthDropdown.js
  init_define_import_meta_env();
  function labelMonthDropdown(_options) {
    return "Choose the Month";
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelNav.js
  init_define_import_meta_env();
  function labelNav() {
    return "";
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelNext.js
  init_define_import_meta_env();
  var defaultLabel = "Go to the Next Month";
  function labelNext(_month, _options) {
    return defaultLabel;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelPrevious.js
  init_define_import_meta_env();
  function labelPrevious(_month) {
    return "Go to the Previous Month";
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelWeekday.js
  init_define_import_meta_env();
  function labelWeekday(date, options2, dateLib) {
    return (dateLib ?? new DateLib(options2)).format(date, "cccc");
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelWeekNumber.js
  init_define_import_meta_env();
  function labelWeekNumber(weekNumber, _options) {
    return `Week ${weekNumber}`;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelWeekNumberHeader.js
  init_define_import_meta_env();
  function labelWeekNumberHeader(_options) {
    return "Week Number";
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/labels/labelYearDropdown.js
  init_define_import_meta_env();
  function labelYearDropdown(_options) {
    return "Choose the Year";
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getLabels.js
  var resolveLabel = (defaultLabel2, customLabel, localeLabel) => {
    if (customLabel)
      return customLabel;
    if (localeLabel) {
      return typeof localeLabel === "function" ? localeLabel : (..._args) => localeLabel;
    }
    return defaultLabel2;
  };
  function getLabels(customLabels, options2) {
    const localeLabels = options2.locale?.labels ?? {};
    return {
      ...labels_exports,
      ...customLabels ?? {},
      labelDayButton: resolveLabel(labelDayButton, customLabels?.labelDayButton, localeLabels.labelDayButton),
      labelMonthDropdown: resolveLabel(labelMonthDropdown, customLabels?.labelMonthDropdown, localeLabels.labelMonthDropdown),
      labelNext: resolveLabel(labelNext, customLabels?.labelNext, localeLabels.labelNext),
      labelPrevious: resolveLabel(labelPrevious, customLabels?.labelPrevious, localeLabels.labelPrevious),
      labelWeekNumber: resolveLabel(labelWeekNumber, customLabels?.labelWeekNumber, localeLabels.labelWeekNumber),
      labelYearDropdown: resolveLabel(labelYearDropdown, customLabels?.labelYearDropdown, localeLabels.labelYearDropdown),
      labelGrid: resolveLabel(labelGrid, customLabels?.labelGrid, localeLabels.labelGrid),
      labelGridcell: resolveLabel(labelGridcell, customLabels?.labelGridcell, localeLabels.labelGridcell),
      labelNav: resolveLabel(labelNav, customLabels?.labelNav, localeLabels.labelNav),
      labelWeekNumberHeader: resolveLabel(labelWeekNumberHeader, customLabels?.labelWeekNumberHeader, localeLabels.labelWeekNumberHeader),
      labelWeekday: resolveLabel(labelWeekday, customLabels?.labelWeekday, localeLabels.labelWeekday)
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getMonthOptions.js
  init_define_import_meta_env();
  function getMonthOptions(displayMonth, navStart, navEnd, formatters2, dateLib) {
    const { startOfMonth: startOfMonth2, startOfYear: startOfYear2, endOfYear: endOfYear2, eachMonthOfInterval: eachMonthOfInterval2, getMonth: getMonth2 } = dateLib;
    const months = eachMonthOfInterval2({
      start: startOfYear2(displayMonth),
      end: endOfYear2(displayMonth)
    });
    const options2 = months.map((month) => {
      const label = formatters2.formatMonthDropdown(month, dateLib);
      const value = getMonth2(month);
      const disabled = navStart && month < startOfMonth2(navStart) || navEnd && month > startOfMonth2(navEnd) || false;
      return { value, label, disabled };
    });
    return options2;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getStyleForModifiers.js
  init_define_import_meta_env();
  function getStyleForModifiers(dayModifiers, styles = {}, modifiersStyles = {}) {
    let style = { ...styles?.[UI.Day] };
    Object.entries(dayModifiers).filter(([, active]) => active === true).forEach(([modifier]) => {
      style = {
        ...style,
        ...modifiersStyles?.[modifier]
      };
    });
    return style;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getWeekdays.js
  init_define_import_meta_env();
  function getWeekdays(dateLib, ISOWeek, broadcastCalendar, today) {
    const referenceToday = today ?? dateLib.today();
    const start = broadcastCalendar ? dateLib.startOfBroadcastWeek(referenceToday, dateLib) : ISOWeek ? dateLib.startOfISOWeek(referenceToday) : dateLib.startOfWeek(referenceToday);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = dateLib.addDays(start, i);
      days.push(day);
    }
    return days;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getYearOptions.js
  init_define_import_meta_env();
  function getYearOptions(navStart, navEnd, formatters2, dateLib, reverse = false) {
    if (!navStart)
      return void 0;
    if (!navEnd)
      return void 0;
    const { startOfYear: startOfYear2, endOfYear: endOfYear2, eachYearOfInterval: eachYearOfInterval2, getYear: getYear2 } = dateLib;
    const firstNavYear = startOfYear2(navStart);
    const lastNavYear = endOfYear2(navEnd);
    const years = eachYearOfInterval2({ start: firstNavYear, end: lastNavYear });
    if (reverse)
      years.reverse();
    return years.map((year) => {
      const label = formatters2.formatYearDropdown(year, dateLib);
      return {
        value: getYear2(year),
        label,
        disabled: false
      };
    });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/noonDateLib.js
  init_define_import_meta_env();
  function createNoonOverrides(timeZone, options2 = {}) {
    const { weekStartsOn, locale } = options2;
    const fallbackWeekStartsOn = weekStartsOn ?? locale?.options?.weekStartsOn ?? 0;
    const toNoonTZDate = (date) => {
      const normalizedDate = typeof date === "number" || typeof date === "string" ? new Date(date) : date;
      return new TZDate(normalizedDate.getFullYear(), normalizedDate.getMonth(), normalizedDate.getDate(), 12, 0, 0, timeZone);
    };
    const toCalendarDate = (date) => {
      const zoned = toNoonTZDate(date);
      return new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0, 0);
    };
    return {
      today: () => {
        return toNoonTZDate(TZDate.tz(timeZone));
      },
      newDate: (year, monthIndex, date) => {
        return new TZDate(year, monthIndex, date, 12, 0, 0, timeZone);
      },
      startOfDay: (date) => {
        return toNoonTZDate(date);
      },
      startOfWeek: (date, options3) => {
        const base = toNoonTZDate(date);
        const weekStartsOnValue = options3?.weekStartsOn ?? fallbackWeekStartsOn;
        const diff = (base.getDay() - weekStartsOnValue + 7) % 7;
        base.setDate(base.getDate() - diff);
        return base;
      },
      startOfISOWeek: (date) => {
        const base = toNoonTZDate(date);
        const diff = (base.getDay() - 1 + 7) % 7;
        base.setDate(base.getDate() - diff);
        return base;
      },
      startOfMonth: (date) => {
        const base = toNoonTZDate(date);
        base.setDate(1);
        return base;
      },
      startOfYear: (date) => {
        const base = toNoonTZDate(date);
        base.setMonth(0, 1);
        return base;
      },
      endOfWeek: (date, options3) => {
        const base = toNoonTZDate(date);
        const weekStartsOnValue = options3?.weekStartsOn ?? fallbackWeekStartsOn;
        const endDow = (weekStartsOnValue + 6) % 7;
        const diff = (endDow - base.getDay() + 7) % 7;
        base.setDate(base.getDate() + diff);
        return base;
      },
      endOfISOWeek: (date) => {
        const base = toNoonTZDate(date);
        const diff = (7 - base.getDay()) % 7;
        base.setDate(base.getDate() + diff);
        return base;
      },
      endOfMonth: (date) => {
        const base = toNoonTZDate(date);
        base.setMonth(base.getMonth() + 1, 0);
        return base;
      },
      endOfYear: (date) => {
        const base = toNoonTZDate(date);
        base.setMonth(11, 31);
        return base;
      },
      eachMonthOfInterval: (interval) => {
        const start = toNoonTZDate(interval.start);
        const end = toNoonTZDate(interval.end);
        const result = [];
        const cursor = new TZDate(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, timeZone);
        const endKey = end.getFullYear() * 12 + end.getMonth();
        while (cursor.getFullYear() * 12 + cursor.getMonth() <= endKey) {
          result.push(new TZDate(cursor, timeZone));
          cursor.setMonth(cursor.getMonth() + 1, 1);
        }
        return result;
      },
      // Normalize to noon once before arithmetic (avoid DST/midnight edge cases),
      // mutate the same TZDate, and return it.
      addDays: (date, amount) => {
        const base = toNoonTZDate(date);
        base.setDate(base.getDate() + amount);
        return base;
      },
      addWeeks: (date, amount) => {
        const base = toNoonTZDate(date);
        base.setDate(base.getDate() + amount * 7);
        return base;
      },
      addMonths: (date, amount) => {
        const base = toNoonTZDate(date);
        base.setMonth(base.getMonth() + amount);
        return base;
      },
      addYears: (date, amount) => {
        const base = toNoonTZDate(date);
        base.setFullYear(base.getFullYear() + amount);
        return base;
      },
      eachYearOfInterval: (interval) => {
        const start = toNoonTZDate(interval.start);
        const end = toNoonTZDate(interval.end);
        const years = [];
        const cursor = new TZDate(start.getFullYear(), 0, 1, 12, 0, 0, timeZone);
        while (cursor.getFullYear() <= end.getFullYear()) {
          years.push(new TZDate(cursor, timeZone));
          cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
        }
        return years;
      },
      getWeek: (date, options3) => {
        const base = toCalendarDate(date);
        return getWeek(base, {
          weekStartsOn: options3?.weekStartsOn ?? fallbackWeekStartsOn,
          firstWeekContainsDate: options3?.firstWeekContainsDate ?? locale?.options?.firstWeekContainsDate ?? 1
        });
      },
      getISOWeek: (date) => {
        const base = toCalendarDate(date);
        return getISOWeek(base);
      },
      differenceInCalendarDays: (dateLeft, dateRight) => {
        const left = toCalendarDate(dateLeft);
        const right = toCalendarDate(dateRight);
        return differenceInCalendarDays(left, right);
      },
      differenceInCalendarMonths: (dateLeft, dateRight) => {
        const left = toCalendarDate(dateLeft);
        const right = toCalendarDate(dateRight);
        return differenceInCalendarMonths(left, right);
      }
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useAnimation.js
  init_define_import_meta_env();
  var import_react29 = __toESM(require_react_shim(), 1);
  var asHtmlElement = (element) => {
    if (element instanceof HTMLElement)
      return element;
    return null;
  };
  var queryMonthEls = (element) => [
    ...element.querySelectorAll("[data-animated-month]") ?? []
  ];
  var queryMonthEl = (element) => asHtmlElement(element.querySelector("[data-animated-month]"));
  var queryCaptionEl = (element) => asHtmlElement(element.querySelector("[data-animated-caption]"));
  var queryWeeksEl = (element) => asHtmlElement(element.querySelector("[data-animated-weeks]"));
  var queryNavEl = (element) => asHtmlElement(element.querySelector("[data-animated-nav]"));
  var queryWeekdaysEl = (element) => asHtmlElement(element.querySelector("[data-animated-weekdays]"));
  function useAnimation(rootElRef, enabled, { classNames, months, focused, dateLib }) {
    const previousRootElSnapshotRef = (0, import_react29.useRef)(null);
    const previousMonthsRef = (0, import_react29.useRef)(months);
    const animatingRef = (0, import_react29.useRef)(false);
    (0, import_react29.useLayoutEffect)(() => {
      const previousMonths = previousMonthsRef.current;
      previousMonthsRef.current = months;
      if (!enabled || !rootElRef.current || // safety check because the ref can be set to anything by consumers
      !(rootElRef.current instanceof HTMLElement) || // validation required for the animation to work as expected
      months.length === 0 || previousMonths.length === 0 || months.length !== previousMonths.length) {
        return;
      }
      const isSameMonth2 = dateLib.isSameMonth(months[0].date, previousMonths[0].date);
      const isAfterPreviousMonth = dateLib.isAfter(months[0].date, previousMonths[0].date);
      const captionAnimationClass = isAfterPreviousMonth ? classNames[Animation.caption_after_enter] : classNames[Animation.caption_before_enter];
      const weeksAnimationClass = isAfterPreviousMonth ? classNames[Animation.weeks_after_enter] : classNames[Animation.weeks_before_enter];
      const previousRootElSnapshot = previousRootElSnapshotRef.current;
      const rootElSnapshot = rootElRef.current.cloneNode(true);
      if (rootElSnapshot instanceof HTMLElement) {
        const currentMonthElsSnapshot = queryMonthEls(rootElSnapshot);
        currentMonthElsSnapshot.forEach((currentMonthElSnapshot) => {
          if (!(currentMonthElSnapshot instanceof HTMLElement))
            return;
          const previousMonthElSnapshot = queryMonthEl(currentMonthElSnapshot);
          if (previousMonthElSnapshot && currentMonthElSnapshot.contains(previousMonthElSnapshot)) {
            currentMonthElSnapshot.removeChild(previousMonthElSnapshot);
          }
          const captionEl = queryCaptionEl(currentMonthElSnapshot);
          if (captionEl) {
            captionEl.classList.remove(captionAnimationClass);
          }
          const weeksEl = queryWeeksEl(currentMonthElSnapshot);
          if (weeksEl) {
            weeksEl.classList.remove(weeksAnimationClass);
          }
        });
        previousRootElSnapshotRef.current = rootElSnapshot;
      } else {
        previousRootElSnapshotRef.current = null;
      }
      if (animatingRef.current || isSameMonth2 || // skip animation if a day is focused because it can cause issues to the animation and is better for a11y
      focused) {
        return;
      }
      const previousMonthEls = previousRootElSnapshot instanceof HTMLElement ? queryMonthEls(previousRootElSnapshot) : [];
      const currentMonthEls = queryMonthEls(rootElRef.current);
      if (currentMonthEls?.every((el) => el instanceof HTMLElement) && previousMonthEls?.every((el) => el instanceof HTMLElement)) {
        animatingRef.current = true;
        const cleanUpFunctions = [];
        rootElRef.current.style.isolation = "isolate";
        const navEl = queryNavEl(rootElRef.current);
        if (navEl) {
          navEl.style.zIndex = "1";
        }
        currentMonthEls.forEach((currentMonthEl, index2) => {
          const previousMonthEl = previousMonthEls[index2];
          if (!previousMonthEl) {
            return;
          }
          currentMonthEl.style.position = "relative";
          currentMonthEl.style.overflow = "hidden";
          const captionEl = queryCaptionEl(currentMonthEl);
          if (captionEl) {
            captionEl.classList.add(captionAnimationClass);
          }
          const weeksEl = queryWeeksEl(currentMonthEl);
          if (weeksEl) {
            weeksEl.classList.add(weeksAnimationClass);
          }
          const cleanUp = () => {
            animatingRef.current = false;
            if (rootElRef.current) {
              rootElRef.current.style.isolation = "";
            }
            if (navEl) {
              navEl.style.zIndex = "";
            }
            if (captionEl) {
              captionEl.classList.remove(captionAnimationClass);
            }
            if (weeksEl) {
              weeksEl.classList.remove(weeksAnimationClass);
            }
            currentMonthEl.style.position = "";
            currentMonthEl.style.overflow = "";
            if (currentMonthEl.contains(previousMonthEl)) {
              currentMonthEl.removeChild(previousMonthEl);
            }
          };
          cleanUpFunctions.push(cleanUp);
          previousMonthEl.style.pointerEvents = "none";
          previousMonthEl.style.position = "absolute";
          previousMonthEl.style.overflow = "hidden";
          previousMonthEl.setAttribute("aria-hidden", "true");
          const previousWeekdaysEl = queryWeekdaysEl(previousMonthEl);
          if (previousWeekdaysEl) {
            previousWeekdaysEl.style.opacity = "0";
          }
          const previousCaptionEl = queryCaptionEl(previousMonthEl);
          if (previousCaptionEl) {
            previousCaptionEl.classList.add(isAfterPreviousMonth ? classNames[Animation.caption_before_exit] : classNames[Animation.caption_after_exit]);
            previousCaptionEl.addEventListener("animationend", cleanUp);
          }
          const previousWeeksEl = queryWeeksEl(previousMonthEl);
          if (previousWeeksEl) {
            previousWeeksEl.classList.add(isAfterPreviousMonth ? classNames[Animation.weeks_before_exit] : classNames[Animation.weeks_after_exit]);
          }
          currentMonthEl.insertBefore(previousMonthEl, currentMonthEl.firstChild);
        });
      }
    });
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useCalendar.js
  init_define_import_meta_env();
  var import_react31 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getDates.js
  init_define_import_meta_env();
  function getDates(displayMonths, maxDate, props, dateLib) {
    const firstMonth = displayMonths[0];
    const lastMonth = displayMonths[displayMonths.length - 1];
    const { ISOWeek, fixedWeeks, broadcastCalendar } = props ?? {};
    const { addDays: addDays2, differenceInCalendarDays: differenceInCalendarDays2, differenceInCalendarMonths: differenceInCalendarMonths2, endOfBroadcastWeek: endOfBroadcastWeek2, endOfISOWeek: endOfISOWeek2, endOfMonth: endOfMonth2, endOfWeek: endOfWeek2, isAfter: isAfter2, startOfBroadcastWeek: startOfBroadcastWeek2, startOfISOWeek: startOfISOWeek2, startOfWeek: startOfWeek2 } = dateLib;
    const startWeekFirstDate = broadcastCalendar ? startOfBroadcastWeek2(firstMonth, dateLib) : ISOWeek ? startOfISOWeek2(firstMonth) : startOfWeek2(firstMonth);
    const displayMonthsWeekEnd = broadcastCalendar ? endOfBroadcastWeek2(lastMonth) : ISOWeek ? endOfISOWeek2(endOfMonth2(lastMonth)) : endOfWeek2(endOfMonth2(lastMonth));
    const constraintWeekEnd = maxDate && (broadcastCalendar ? endOfBroadcastWeek2(maxDate) : ISOWeek ? endOfISOWeek2(maxDate) : endOfWeek2(maxDate));
    const gridEndDate = constraintWeekEnd && isAfter2(displayMonthsWeekEnd, constraintWeekEnd) ? constraintWeekEnd : displayMonthsWeekEnd;
    const nOfDays = differenceInCalendarDays2(gridEndDate, startWeekFirstDate);
    const nOfMonths = differenceInCalendarMonths2(lastMonth, firstMonth) + 1;
    const dates = [];
    for (let i = 0; i <= nOfDays; i++) {
      const date = addDays2(startWeekFirstDate, i);
      dates.push(date);
    }
    const nrOfDaysWithFixedWeeks = broadcastCalendar ? 35 : 42;
    const extraDates = nrOfDaysWithFixedWeeks * nOfMonths;
    if (fixedWeeks && dates.length < extraDates) {
      const daysToAdd = extraDates - dates.length;
      for (let i = 0; i < daysToAdd; i++) {
        const date = addDays2(dates[dates.length - 1], 1);
        dates.push(date);
      }
    }
    return dates;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getDays.js
  init_define_import_meta_env();
  function getDays(calendarMonths) {
    const initialDays = [];
    return calendarMonths.reduce((days, month) => {
      const weekDays = month.weeks.reduce((weekDays2, week) => {
        return weekDays2.concat(week.days.slice());
      }, initialDays.slice());
      return days.concat(weekDays.slice());
    }, initialDays.slice());
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getDisplayMonths.js
  init_define_import_meta_env();
  function getDisplayMonths(firstDisplayedMonth, calendarEndMonth, props, dateLib) {
    const { numberOfMonths = 1 } = props;
    const months = [];
    for (let i = 0; i < numberOfMonths; i++) {
      const month = dateLib.addMonths(firstDisplayedMonth, i);
      if (calendarEndMonth && month > calendarEndMonth) {
        break;
      }
      months.push(month);
    }
    return months;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getInitialMonth.js
  init_define_import_meta_env();
  function getInitialMonth(props, navStart, navEnd, dateLib) {
    const { month, defaultMonth, today = dateLib.today(), numberOfMonths = 1 } = props;
    let initialMonth = month || defaultMonth || today;
    const { differenceInCalendarMonths: differenceInCalendarMonths2, addMonths: addMonths2, startOfMonth: startOfMonth2 } = dateLib;
    if (navEnd && differenceInCalendarMonths2(navEnd, initialMonth) < numberOfMonths - 1) {
      const offset4 = -1 * (numberOfMonths - 1);
      initialMonth = addMonths2(navEnd, offset4);
    }
    if (navStart && differenceInCalendarMonths2(initialMonth, navStart) < 0) {
      initialMonth = navStart;
    }
    return startOfMonth2(initialMonth);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getMonths.js
  init_define_import_meta_env();
  function getMonths(displayMonths, dates, props, dateLib) {
    const { addDays: addDays2, endOfBroadcastWeek: endOfBroadcastWeek2, endOfISOWeek: endOfISOWeek2, endOfMonth: endOfMonth2, endOfWeek: endOfWeek2, getISOWeek: getISOWeek2, getWeek: getWeek2, startOfBroadcastWeek: startOfBroadcastWeek2, startOfISOWeek: startOfISOWeek2, startOfWeek: startOfWeek2 } = dateLib;
    const dayPickerMonths = displayMonths.reduce((months, month) => {
      const firstDateOfFirstWeek = props.broadcastCalendar ? startOfBroadcastWeek2(month, dateLib) : props.ISOWeek ? startOfISOWeek2(month) : startOfWeek2(month);
      const lastDateOfLastWeek = props.broadcastCalendar ? endOfBroadcastWeek2(month) : props.ISOWeek ? endOfISOWeek2(endOfMonth2(month)) : endOfWeek2(endOfMonth2(month));
      const monthDates = dates.filter((date) => {
        return date >= firstDateOfFirstWeek && date <= lastDateOfLastWeek;
      });
      const nrOfDaysWithFixedWeeks = props.broadcastCalendar ? 35 : 42;
      if (props.fixedWeeks && monthDates.length < nrOfDaysWithFixedWeeks) {
        const extraDates = dates.filter((date) => {
          const daysToAdd = nrOfDaysWithFixedWeeks - monthDates.length;
          return date > lastDateOfLastWeek && date <= addDays2(lastDateOfLastWeek, daysToAdd);
        });
        monthDates.push(...extraDates);
      }
      const weeks = monthDates.reduce((weeks2, date) => {
        const weekNumber = props.ISOWeek ? getISOWeek2(date) : getWeek2(date);
        const week = weeks2.find((week2) => week2.weekNumber === weekNumber);
        const day = new CalendarDay(date, month, dateLib);
        if (!week) {
          weeks2.push(new CalendarWeek(weekNumber, [day]));
        } else {
          week.days.push(day);
        }
        return weeks2;
      }, []);
      const dayPickerMonth = new CalendarMonth(month, weeks);
      months.push(dayPickerMonth);
      return months;
    }, []);
    if (!props.reverseMonths) {
      return dayPickerMonths;
    } else {
      return dayPickerMonths.reverse();
    }
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getNavMonth.js
  init_define_import_meta_env();
  function getNavMonths(props, dateLib) {
    let { startMonth, endMonth } = props;
    const { startOfYear: startOfYear2, startOfDay: startOfDay2, startOfMonth: startOfMonth2, endOfMonth: endOfMonth2, addYears: addYears2, endOfYear: endOfYear2, today } = dateLib;
    const hasYearDropdown = props.captionLayout === "dropdown" || props.captionLayout === "dropdown-years";
    if (startMonth) {
      startMonth = startOfMonth2(startMonth);
    } else if (!startMonth && hasYearDropdown) {
      startMonth = startOfYear2(addYears2(props.today ?? today(), -100));
    }
    if (endMonth) {
      endMonth = endOfMonth2(endMonth);
    } else if (!endMonth && hasYearDropdown) {
      endMonth = endOfYear2(props.today ?? today());
    }
    return [
      startMonth ? startOfDay2(startMonth) : startMonth,
      endMonth ? startOfDay2(endMonth) : endMonth
    ];
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getNextMonth.js
  init_define_import_meta_env();
  function getNextMonth(firstDisplayedMonth, calendarEndMonth, options2, dateLib) {
    if (options2.disableNavigation) {
      return void 0;
    }
    const { pagedNavigation, numberOfMonths = 1 } = options2;
    const { startOfMonth: startOfMonth2, addMonths: addMonths2, differenceInCalendarMonths: differenceInCalendarMonths2 } = dateLib;
    const offset4 = pagedNavigation ? numberOfMonths : 1;
    const month = startOfMonth2(firstDisplayedMonth);
    if (!calendarEndMonth) {
      return addMonths2(month, offset4);
    }
    const monthsDiff = differenceInCalendarMonths2(calendarEndMonth, firstDisplayedMonth);
    if (monthsDiff < numberOfMonths) {
      return void 0;
    }
    return addMonths2(month, offset4);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getPreviousMonth.js
  init_define_import_meta_env();
  function getPreviousMonth(firstDisplayedMonth, calendarStartMonth, options2, dateLib) {
    if (options2.disableNavigation) {
      return void 0;
    }
    const { pagedNavigation, numberOfMonths } = options2;
    const { startOfMonth: startOfMonth2, addMonths: addMonths2, differenceInCalendarMonths: differenceInCalendarMonths2 } = dateLib;
    const offset4 = pagedNavigation ? numberOfMonths ?? 1 : 1;
    const month = startOfMonth2(firstDisplayedMonth);
    if (!calendarStartMonth) {
      return addMonths2(month, -offset4);
    }
    const monthsDiff = differenceInCalendarMonths2(month, calendarStartMonth);
    if (monthsDiff <= 0) {
      return void 0;
    }
    return addMonths2(month, -offset4);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getWeeks.js
  init_define_import_meta_env();
  function getWeeks(months) {
    const initialWeeks = [];
    return months.reduce((weeks, month) => {
      return weeks.concat(month.weeks.slice());
    }, initialWeeks.slice());
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/useControlledValue.js
  init_define_import_meta_env();
  var import_react30 = __toESM(require_react_shim(), 1);
  function useControlledValue(defaultValue, controlledValue) {
    const [uncontrolledValue, setValue] = (0, import_react30.useState)(defaultValue);
    const value = controlledValue === void 0 ? uncontrolledValue : controlledValue;
    return [value, setValue];
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useCalendar.js
  function useCalendar(props, dateLib) {
    const [navStart, navEnd] = getNavMonths(props, dateLib);
    const { startOfMonth: startOfMonth2, endOfMonth: endOfMonth2 } = dateLib;
    const initialMonth = getInitialMonth(props, navStart, navEnd, dateLib);
    const [firstMonth, setFirstMonth] = useControlledValue(
      initialMonth,
      // initialMonth is always computed from props.month if provided
      props.month ? initialMonth : void 0
    );
    (0, import_react31.useEffect)(() => {
      const newInitialMonth = getInitialMonth(props, navStart, navEnd, dateLib);
      setFirstMonth(newInitialMonth);
    }, [props.timeZone]);
    const { months, weeks, days, previousMonth, nextMonth } = (0, import_react31.useMemo)(() => {
      const displayMonths = getDisplayMonths(firstMonth, navEnd, { numberOfMonths: props.numberOfMonths }, dateLib);
      const dates = getDates(displayMonths, props.endMonth ? endOfMonth2(props.endMonth) : void 0, {
        ISOWeek: props.ISOWeek,
        fixedWeeks: props.fixedWeeks,
        broadcastCalendar: props.broadcastCalendar
      }, dateLib);
      const months2 = getMonths(displayMonths, dates, {
        broadcastCalendar: props.broadcastCalendar,
        fixedWeeks: props.fixedWeeks,
        ISOWeek: props.ISOWeek,
        reverseMonths: props.reverseMonths
      }, dateLib);
      const weeks2 = getWeeks(months2);
      const days2 = getDays(months2);
      const previousMonth2 = getPreviousMonth(firstMonth, navStart, props, dateLib);
      const nextMonth2 = getNextMonth(firstMonth, navEnd, props, dateLib);
      return {
        months: months2,
        weeks: weeks2,
        days: days2,
        previousMonth: previousMonth2,
        nextMonth: nextMonth2
      };
    }, [
      dateLib,
      firstMonth.getTime(),
      navEnd?.getTime(),
      navStart?.getTime(),
      props.disableNavigation,
      props.broadcastCalendar,
      props.endMonth?.getTime(),
      props.fixedWeeks,
      props.ISOWeek,
      props.numberOfMonths,
      props.pagedNavigation,
      props.reverseMonths
    ]);
    const { disableNavigation, onMonthChange } = props;
    const isDayInCalendar = (day) => weeks.some((week) => week.days.some((d) => d.isEqualTo(day)));
    const goToMonth = (date) => {
      if (disableNavigation) {
        return;
      }
      let newMonth = startOfMonth2(date);
      if (navStart && newMonth < startOfMonth2(navStart)) {
        newMonth = startOfMonth2(navStart);
      }
      if (navEnd && newMonth > startOfMonth2(navEnd)) {
        newMonth = startOfMonth2(navEnd);
      }
      setFirstMonth(newMonth);
      onMonthChange?.(newMonth);
    };
    const goToDay = (day) => {
      if (isDayInCalendar(day)) {
        return;
      }
      goToMonth(day.date);
    };
    const calendar = {
      months,
      weeks,
      days,
      navStart,
      navEnd,
      previousMonth,
      nextMonth,
      goToMonth,
      goToDay
    };
    return calendar;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useFocus.js
  init_define_import_meta_env();
  var import_react32 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/calculateFocusTarget.js
  init_define_import_meta_env();
  var FocusTargetPriority;
  (function(FocusTargetPriority2) {
    FocusTargetPriority2[FocusTargetPriority2["Today"] = 0] = "Today";
    FocusTargetPriority2[FocusTargetPriority2["Selected"] = 1] = "Selected";
    FocusTargetPriority2[FocusTargetPriority2["LastFocused"] = 2] = "LastFocused";
    FocusTargetPriority2[FocusTargetPriority2["FocusedModifier"] = 3] = "FocusedModifier";
  })(FocusTargetPriority || (FocusTargetPriority = {}));
  function isFocusableDay(modifiers) {
    return !modifiers[DayFlag.disabled] && !modifiers[DayFlag.hidden] && !modifiers[DayFlag.outside];
  }
  function calculateFocusTarget(days, getModifiers, isSelected, lastFocused) {
    let focusTarget;
    let foundFocusTargetPriority = -1;
    for (const day of days) {
      const modifiers = getModifiers(day);
      if (isFocusableDay(modifiers)) {
        if (modifiers[DayFlag.focused] && foundFocusTargetPriority < FocusTargetPriority.FocusedModifier) {
          focusTarget = day;
          foundFocusTargetPriority = FocusTargetPriority.FocusedModifier;
        } else if (lastFocused?.isEqualTo(day) && foundFocusTargetPriority < FocusTargetPriority.LastFocused) {
          focusTarget = day;
          foundFocusTargetPriority = FocusTargetPriority.LastFocused;
        } else if (isSelected(day.date) && foundFocusTargetPriority < FocusTargetPriority.Selected) {
          focusTarget = day;
          foundFocusTargetPriority = FocusTargetPriority.Selected;
        } else if (modifiers[DayFlag.today] && foundFocusTargetPriority < FocusTargetPriority.Today) {
          focusTarget = day;
          foundFocusTargetPriority = FocusTargetPriority.Today;
        }
      }
    }
    if (!focusTarget) {
      focusTarget = days.find((day) => isFocusableDay(getModifiers(day)));
    }
    return focusTarget;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getNextFocus.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getFocusableDate.js
  init_define_import_meta_env();
  function getFocusableDate(moveBy, moveDir, refDate, navStart, navEnd, props, dateLib) {
    const { ISOWeek, broadcastCalendar } = props;
    const { addDays: addDays2, addMonths: addMonths2, addWeeks: addWeeks2, addYears: addYears2, endOfBroadcastWeek: endOfBroadcastWeek2, endOfISOWeek: endOfISOWeek2, endOfWeek: endOfWeek2, max: max3, min: min3, startOfBroadcastWeek: startOfBroadcastWeek2, startOfISOWeek: startOfISOWeek2, startOfWeek: startOfWeek2 } = dateLib;
    const moveFns = {
      day: addDays2,
      week: addWeeks2,
      month: addMonths2,
      year: addYears2,
      startOfWeek: (date) => broadcastCalendar ? startOfBroadcastWeek2(date, dateLib) : ISOWeek ? startOfISOWeek2(date) : startOfWeek2(date),
      endOfWeek: (date) => broadcastCalendar ? endOfBroadcastWeek2(date) : ISOWeek ? endOfISOWeek2(date) : endOfWeek2(date)
    };
    let focusableDate = moveFns[moveBy](refDate, moveDir === "after" ? 1 : -1);
    if (moveDir === "before" && navStart) {
      focusableDate = max3([navStart, focusableDate]);
    } else if (moveDir === "after" && navEnd) {
      focusableDate = min3([navEnd, focusableDate]);
    }
    return focusableDate;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/helpers/getNextFocus.js
  function getNextFocus(moveBy, moveDir, refDay, calendarStartMonth, calendarEndMonth, props, dateLib, attempt = 0) {
    if (attempt > 365) {
      return void 0;
    }
    const focusableDate = getFocusableDate(moveBy, moveDir, refDay.date, calendarStartMonth, calendarEndMonth, props, dateLib);
    const isDisabled = Boolean(props.disabled && dateMatchModifiers(focusableDate, props.disabled, dateLib));
    const isHidden2 = Boolean(props.hidden && dateMatchModifiers(focusableDate, props.hidden, dateLib));
    const targetMonth = focusableDate;
    const focusDay = new CalendarDay(focusableDate, targetMonth, dateLib);
    if (!isDisabled && !isHidden2) {
      return focusDay;
    }
    return getNextFocus(moveBy, moveDir, focusDay, calendarStartMonth, calendarEndMonth, props, dateLib, attempt + 1);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useFocus.js
  function useFocus(props, calendar, getModifiers, isSelected, dateLib) {
    const { autoFocus } = props;
    const [lastFocused, setLastFocused] = (0, import_react32.useState)();
    const focusTarget = calculateFocusTarget(calendar.days, getModifiers, isSelected || (() => false), lastFocused);
    const [focusedDay, setFocused] = (0, import_react32.useState)(autoFocus ? focusTarget : void 0);
    const blur = () => {
      setLastFocused(focusedDay);
      setFocused(void 0);
    };
    const moveFocus = (moveBy, moveDir) => {
      if (!focusedDay)
        return;
      const nextFocus = getNextFocus(moveBy, moveDir, focusedDay, calendar.navStart, calendar.navEnd, props, dateLib);
      if (!nextFocus)
        return;
      if (props.disableNavigation) {
        const isNextInCalendar = calendar.days.some((day) => day.isEqualTo(nextFocus));
        if (!isNextInCalendar) {
          return;
        }
      }
      calendar.goToDay(nextFocus);
      setFocused(nextFocus);
    };
    const isFocusTarget = (day) => {
      return Boolean(focusTarget?.isEqualTo(day));
    };
    const useFocus2 = {
      isFocusTarget,
      setFocused,
      focused: focusedDay,
      blur,
      moveFocus
    };
    return useFocus2;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useSelection.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/selection/useMulti.js
  init_define_import_meta_env();
  function useMulti(props, dateLib) {
    const { selected: initiallySelected, required, onSelect } = props;
    const [internallySelected, setSelected] = useControlledValue(initiallySelected, onSelect ? initiallySelected : void 0);
    const selected = !onSelect ? internallySelected : initiallySelected;
    const { isSameDay: isSameDay2 } = dateLib;
    const isSelected = (date) => {
      return selected?.some((d) => isSameDay2(d, date)) ?? false;
    };
    const { min: min3, max: max3 } = props;
    const select = (triggerDate, modifiers, e) => {
      let newDates = [...selected ?? []];
      if (isSelected(triggerDate)) {
        if (selected?.length === min3) {
          return;
        }
        if (required && selected?.length === 1) {
          return;
        }
        newDates = selected?.filter((d) => !isSameDay2(d, triggerDate));
      } else {
        if (selected?.length === max3) {
          newDates = [triggerDate];
        } else {
          newDates = [...newDates, triggerDate];
        }
      }
      if (!onSelect) {
        setSelected(newDates);
      }
      onSelect?.(newDates, triggerDate, modifiers, e);
      return newDates;
    };
    return {
      selected,
      select,
      isSelected
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/selection/useRange.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/addToRange.js
  init_define_import_meta_env();
  function addToRange(date, initialRange, min3 = 0, max3 = 0, required = false, dateLib = defaultDateLib) {
    const { from, to } = initialRange || {};
    const { isSameDay: isSameDay2, isAfter: isAfter2, isBefore: isBefore2 } = dateLib;
    let range;
    if (!from && !to) {
      range = { from: date, to: min3 > 0 ? void 0 : date };
    } else if (from && !to) {
      if (isSameDay2(from, date)) {
        if (min3 === 0) {
          range = { from, to: date };
        } else if (required) {
          range = { from, to: void 0 };
        } else {
          range = void 0;
        }
      } else if (isBefore2(date, from)) {
        range = { from: date, to: from };
      } else {
        range = { from, to: date };
      }
    } else if (from && to) {
      if (isSameDay2(from, date) && isSameDay2(to, date)) {
        if (required) {
          range = { from, to };
        } else {
          range = void 0;
        }
      } else if (isSameDay2(from, date)) {
        range = { from, to: min3 > 0 ? void 0 : date };
      } else if (isSameDay2(to, date)) {
        range = { from: date, to: min3 > 0 ? void 0 : date };
      } else if (isBefore2(date, from)) {
        range = { from: date, to };
      } else if (isAfter2(date, from)) {
        range = { from, to: date };
      } else if (isAfter2(date, to)) {
        range = { from, to: date };
      } else {
        throw new Error("Invalid range");
      }
    }
    if (range?.from && range?.to) {
      const diff = dateLib.differenceInCalendarDays(range.to, range.from);
      if (max3 > 0 && diff > max3) {
        range = { from: date, to: void 0 };
      } else if (min3 > 1 && diff < min3) {
        range = { from: date, to: void 0 };
      }
    }
    return range;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/rangeContainsDayOfWeek.js
  init_define_import_meta_env();
  function rangeContainsDayOfWeek(range, dayOfWeek, dateLib = defaultDateLib) {
    const dayOfWeekArr = !Array.isArray(dayOfWeek) ? [dayOfWeek] : dayOfWeek;
    let date = range.from;
    const totalDays = dateLib.differenceInCalendarDays(range.to, range.from);
    const totalDaysLimit = Math.min(totalDays, 6);
    for (let i = 0; i <= totalDaysLimit; i++) {
      if (dayOfWeekArr.includes(date.getDay())) {
        return true;
      }
      date = dateLib.addDays(date, 1);
    }
    return false;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/rangeContainsModifiers.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/rangeOverlaps.js
  init_define_import_meta_env();
  function rangeOverlaps(rangeLeft, rangeRight, dateLib = defaultDateLib) {
    return rangeIncludesDate(rangeLeft, rangeRight.from, false, dateLib) || rangeIncludesDate(rangeLeft, rangeRight.to, false, dateLib) || rangeIncludesDate(rangeRight, rangeLeft.from, false, dateLib) || rangeIncludesDate(rangeRight, rangeLeft.to, false, dateLib);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/rangeContainsModifiers.js
  function rangeContainsModifiers(range, modifiers, dateLib = defaultDateLib) {
    const matchers = Array.isArray(modifiers) ? modifiers : [modifiers];
    const nonFunctionMatchers = matchers.filter((matcher) => typeof matcher !== "function");
    const nonFunctionMatchersResult = nonFunctionMatchers.some((matcher) => {
      if (typeof matcher === "boolean")
        return matcher;
      if (dateLib.isDate(matcher)) {
        return rangeIncludesDate(range, matcher, false, dateLib);
      }
      if (isDatesArray(matcher, dateLib)) {
        return matcher.some((date) => rangeIncludesDate(range, date, false, dateLib));
      }
      if (isDateRange(matcher)) {
        if (matcher.from && matcher.to) {
          return rangeOverlaps(range, { from: matcher.from, to: matcher.to }, dateLib);
        }
        return false;
      }
      if (isDayOfWeekType(matcher)) {
        return rangeContainsDayOfWeek(range, matcher.dayOfWeek, dateLib);
      }
      if (isDateInterval(matcher)) {
        const isClosedInterval = dateLib.isAfter(matcher.before, matcher.after);
        if (isClosedInterval) {
          return rangeOverlaps(range, {
            from: dateLib.addDays(matcher.after, 1),
            to: dateLib.addDays(matcher.before, -1)
          }, dateLib);
        }
        return dateMatchModifiers(range.from, matcher, dateLib) || dateMatchModifiers(range.to, matcher, dateLib);
      }
      if (isDateAfterType(matcher) || isDateBeforeType(matcher)) {
        return dateMatchModifiers(range.from, matcher, dateLib) || dateMatchModifiers(range.to, matcher, dateLib);
      }
      return false;
    });
    if (nonFunctionMatchersResult) {
      return true;
    }
    const functionMatchers = matchers.filter((matcher) => typeof matcher === "function");
    if (functionMatchers.length) {
      let date = range.from;
      const totalDays = dateLib.differenceInCalendarDays(range.to, range.from);
      for (let i = 0; i <= totalDays; i++) {
        if (functionMatchers.some((matcher) => matcher(date))) {
          return true;
        }
        date = dateLib.addDays(date, 1);
      }
    }
    return false;
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/selection/useRange.js
  function useRange(props, dateLib) {
    const { disabled, excludeDisabled, resetOnSelect, selected: initiallySelected, required, onSelect } = props;
    const [internallySelected, setSelected] = useControlledValue(initiallySelected, onSelect ? initiallySelected : void 0);
    const selected = !onSelect ? internallySelected : initiallySelected;
    const isSelected = (date) => selected && rangeIncludesDate(selected, date, false, dateLib);
    const select = (triggerDate, modifiers, e) => {
      const { min: min3, max: max3 } = props;
      let newRange;
      if (triggerDate) {
        const selectedFrom = selected?.from;
        const selectedTo = selected?.to;
        const hasFullRange = !!selectedFrom && !!selectedTo;
        const isClickingSingleDayRange = !!selectedFrom && !!selectedTo && dateLib.isSameDay(selectedFrom, selectedTo) && dateLib.isSameDay(triggerDate, selectedFrom);
        if (resetOnSelect && (hasFullRange || !selected?.from)) {
          if (!required && isClickingSingleDayRange) {
            newRange = void 0;
          } else {
            newRange = { from: triggerDate, to: void 0 };
          }
        } else {
          newRange = addToRange(triggerDate, selected, min3, max3, required, dateLib);
        }
      }
      if (excludeDisabled && disabled && newRange?.from && newRange.to) {
        if (rangeContainsModifiers({ from: newRange.from, to: newRange.to }, disabled, dateLib)) {
          newRange.from = triggerDate;
          newRange.to = void 0;
        }
      }
      if (!onSelect) {
        setSelected(newRange);
      }
      onSelect?.(newRange, triggerDate, modifiers, e);
      return newRange;
    };
    return {
      selected,
      select,
      isSelected
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/selection/useSingle.js
  init_define_import_meta_env();
  function useSingle(props, dateLib) {
    const { selected: initiallySelected, required, onSelect } = props;
    const [internallySelected, setSelected] = useControlledValue(initiallySelected, onSelect ? initiallySelected : void 0);
    const selected = !onSelect ? internallySelected : initiallySelected;
    const { isSameDay: isSameDay2 } = dateLib;
    const isSelected = (compareDate) => {
      return selected ? isSameDay2(selected, compareDate) : false;
    };
    const select = (triggerDate, modifiers, e) => {
      let newDate = triggerDate;
      if (!required && selected && selected && isSameDay2(triggerDate, selected)) {
        newDate = void 0;
      }
      if (!onSelect) {
        setSelected(newDate);
      }
      if (required) {
        onSelect?.(newDate, triggerDate, modifiers, e);
      } else {
        onSelect?.(newDate, triggerDate, modifiers, e);
      }
      return newDate;
    };
    return {
      selected,
      select,
      isSelected
    };
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/useSelection.js
  function useSelection(props, dateLib) {
    const single = useSingle(props, dateLib);
    const multi = useMulti(props, dateLib);
    const range = useRange(props, dateLib);
    switch (props.mode) {
      case "single":
        return single;
      case "multiple":
        return multi;
      case "range":
        return range;
      default:
        return void 0;
    }
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/convertMatchersToTimeZone.js
  init_define_import_meta_env();

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/toTimeZone.js
  init_define_import_meta_env();
  function toTimeZone(date, timeZone) {
    if (date instanceof TZDate && date.timeZone === timeZone) {
      return date;
    }
    return new TZDate(date, timeZone);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/utils/convertMatchersToTimeZone.js
  function toZoneNoon(date, timeZone, noonSafe) {
    if (!noonSafe)
      return toTimeZone(date, timeZone);
    const zoned = toTimeZone(date, timeZone);
    const noonZoned = new TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 12, 0, 0, timeZone);
    return new Date(noonZoned.getTime());
  }
  function convertMatcher(matcher, timeZone, noonSafe) {
    if (typeof matcher === "boolean" || typeof matcher === "function") {
      return matcher;
    }
    if (matcher instanceof Date) {
      return toZoneNoon(matcher, timeZone, noonSafe);
    }
    if (Array.isArray(matcher)) {
      return matcher.map((value) => value instanceof Date ? toZoneNoon(value, timeZone, noonSafe) : value);
    }
    if (isDateRange(matcher)) {
      return {
        ...matcher,
        from: matcher.from ? toTimeZone(matcher.from, timeZone) : matcher.from,
        to: matcher.to ? toTimeZone(matcher.to, timeZone) : matcher.to
      };
    }
    if (isDateInterval(matcher)) {
      return {
        before: toZoneNoon(matcher.before, timeZone, noonSafe),
        after: toZoneNoon(matcher.after, timeZone, noonSafe)
      };
    }
    if (isDateAfterType(matcher)) {
      return {
        after: toZoneNoon(matcher.after, timeZone, noonSafe)
      };
    }
    if (isDateBeforeType(matcher)) {
      return {
        before: toZoneNoon(matcher.before, timeZone, noonSafe)
      };
    }
    return matcher;
  }
  function convertMatchersToTimeZone(matchers, timeZone, noonSafe) {
    if (!matchers) {
      return matchers;
    }
    if (Array.isArray(matchers)) {
      return matchers.map((matcher) => convertMatcher(matcher, timeZone, noonSafe));
    }
    return convertMatcher(matchers, timeZone, noonSafe);
  }

  // node_modules/.pnpm/react-day-picker@10.0.1_@types+react@19.2.17_react@19.2.8/node_modules/react-day-picker/dist/esm/DayPicker.js
  function DayPicker(initialProps) {
    let props = initialProps;
    const timeZone = props.timeZone;
    if (timeZone) {
      props = {
        ...initialProps,
        timeZone
      };
      if (props.today) {
        props.today = toTimeZone(props.today, timeZone);
      }
      if (props.month) {
        props.month = toTimeZone(props.month, timeZone);
      }
      if (props.defaultMonth) {
        props.defaultMonth = toTimeZone(props.defaultMonth, timeZone);
      }
      if (props.startMonth) {
        props.startMonth = toTimeZone(props.startMonth, timeZone);
      }
      if (props.endMonth) {
        props.endMonth = toTimeZone(props.endMonth, timeZone);
      }
      if (props.mode === "single" && props.selected) {
        props.selected = toTimeZone(props.selected, timeZone);
      } else if (props.mode === "multiple" && props.selected) {
        props.selected = props.selected?.map((date) => toTimeZone(date, timeZone));
      } else if (props.mode === "range" && props.selected) {
        props.selected = {
          from: props.selected.from ? toTimeZone(props.selected.from, timeZone) : props.selected.from,
          to: props.selected.to ? toTimeZone(props.selected.to, timeZone) : props.selected.to
        };
      }
      if (props.disabled !== void 0) {
        props.disabled = convertMatchersToTimeZone(props.disabled, timeZone);
      }
      if (props.hidden !== void 0) {
        props.hidden = convertMatchersToTimeZone(props.hidden, timeZone);
      }
      if (props.modifiers) {
        const nextModifiers = {};
        Object.keys(props.modifiers).forEach((key) => {
          nextModifiers[key] = convertMatchersToTimeZone(props.modifiers?.[key], timeZone);
        });
        props.modifiers = nextModifiers;
      }
    }
    const { components, formatters: formatters2, labels, dateLib, locale, classNames } = (0, import_react33.useMemo)(() => {
      const locale2 = { ...enUS2, ...props.locale };
      const weekStartsOn = props.broadcastCalendar ? 1 : props.weekStartsOn;
      const noonOverrides = props.noonSafe && props.timeZone ? createNoonOverrides(props.timeZone, {
        weekStartsOn,
        locale: locale2
      }) : void 0;
      const overrides = props.dateLib && noonOverrides ? { ...noonOverrides, ...props.dateLib } : props.dateLib ?? noonOverrides;
      const dateLib2 = new DateLib({
        locale: locale2,
        weekStartsOn,
        firstWeekContainsDate: props.firstWeekContainsDate,
        useAdditionalWeekYearTokens: props.useAdditionalWeekYearTokens,
        useAdditionalDayOfYearTokens: props.useAdditionalDayOfYearTokens,
        timeZone: props.timeZone,
        numerals: props.numerals
      }, overrides);
      return {
        dateLib: dateLib2,
        components: getComponents(props.components),
        formatters: getFormatters(props.formatters),
        labels: getLabels(props.labels, dateLib2.options),
        locale: locale2,
        classNames: { ...getDefaultClassNames(), ...props.classNames }
      };
    }, [
      props.locale,
      props.broadcastCalendar,
      props.weekStartsOn,
      props.firstWeekContainsDate,
      props.useAdditionalWeekYearTokens,
      props.useAdditionalDayOfYearTokens,
      props.timeZone,
      props.numerals,
      props.dateLib,
      props.noonSafe,
      props.components,
      props.formatters,
      props.labels,
      props.classNames
    ]);
    if (!props.today) {
      props = { ...props, today: dateLib.today() };
    }
    const { captionLayout, mode, navLayout, numberOfMonths = 1, onDayBlur, onDayClick, onDayFocus, onDayKeyDown, onDayMouseEnter, onDayMouseLeave, onNextClick, onPrevClick, showWeekNumber, styles } = props;
    const { formatCaption: formatCaption2, formatDay: formatDay2, formatMonthDropdown: formatMonthDropdown2, formatWeekNumber: formatWeekNumber2, formatWeekNumberHeader: formatWeekNumberHeader2, formatWeekdayName: formatWeekdayName2, formatYearDropdown: formatYearDropdown2 } = formatters2;
    const calendar = useCalendar(props, dateLib);
    const { days, months, navStart, navEnd, previousMonth, nextMonth, goToMonth } = calendar;
    const getModifiers = createGetModifiers(days, props, navStart, navEnd, dateLib);
    const { isSelected, select, selected: selectedValue } = useSelection(props, dateLib) ?? {};
    const { blur, focused, isFocusTarget, moveFocus, setFocused } = useFocus(props, calendar, getModifiers, isSelected ?? (() => false), dateLib);
    const { labelDayButton: labelDayButton2, labelGridcell: labelGridcell2, labelGrid: labelGrid2, labelMonthDropdown: labelMonthDropdown2, labelNav: labelNav2, labelPrevious: labelPrevious2, labelNext: labelNext2, labelWeekday: labelWeekday2, labelWeekNumber: labelWeekNumber2, labelWeekNumberHeader: labelWeekNumberHeader2, labelYearDropdown: labelYearDropdown2 } = labels;
    const weekdays = (0, import_react33.useMemo)(() => getWeekdays(dateLib, props.ISOWeek, props.broadcastCalendar, props.today), [dateLib, props.ISOWeek, props.broadcastCalendar, props.today]);
    const isInteractive = mode !== void 0 || onDayClick !== void 0;
    const handlePreviousClick = (0, import_react33.useCallback)(() => {
      if (!previousMonth)
        return;
      goToMonth(previousMonth);
      onPrevClick?.(previousMonth);
    }, [previousMonth, goToMonth, onPrevClick]);
    const handleNextClick = (0, import_react33.useCallback)(() => {
      if (!nextMonth)
        return;
      goToMonth(nextMonth);
      onNextClick?.(nextMonth);
    }, [goToMonth, nextMonth, onNextClick]);
    const handleDayClick = (0, import_react33.useCallback)((day, m) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      setFocused(day);
      if (m.disabled) {
        return;
      }
      select?.(day.date, m, e);
      onDayClick?.(day.date, m, e);
    }, [select, onDayClick, setFocused]);
    const handleDayFocus = (0, import_react33.useCallback)((day, m) => (e) => {
      setFocused(day);
      onDayFocus?.(day.date, m, e);
    }, [onDayFocus, setFocused]);
    const handleDayBlur = (0, import_react33.useCallback)((day, m) => (e) => {
      blur();
      onDayBlur?.(day.date, m, e);
    }, [blur, onDayBlur]);
    const handleDayKeyDown = (0, import_react33.useCallback)((day, modifiers) => (e) => {
      const keyMap = {
        ArrowLeft: [
          e.shiftKey ? "month" : "day",
          props.dir === "rtl" ? "after" : "before"
        ],
        ArrowRight: [
          e.shiftKey ? "month" : "day",
          props.dir === "rtl" ? "before" : "after"
        ],
        ArrowDown: [e.shiftKey ? "year" : "week", "after"],
        ArrowUp: [e.shiftKey ? "year" : "week", "before"],
        PageUp: [e.shiftKey ? "year" : "month", "before"],
        PageDown: [e.shiftKey ? "year" : "month", "after"],
        Home: ["startOfWeek", "before"],
        End: ["endOfWeek", "after"]
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        const [moveBy, moveDir] = keyMap[e.key];
        moveFocus(moveBy, moveDir);
      }
      onDayKeyDown?.(day.date, modifiers, e);
    }, [moveFocus, onDayKeyDown, props.dir]);
    const handleDayMouseEnter = (0, import_react33.useCallback)((day, modifiers) => (e) => {
      onDayMouseEnter?.(day.date, modifiers, e);
    }, [onDayMouseEnter]);
    const handleDayMouseLeave = (0, import_react33.useCallback)((day, modifiers) => (e) => {
      onDayMouseLeave?.(day.date, modifiers, e);
    }, [onDayMouseLeave]);
    const handleMonthChange = (0, import_react33.useCallback)((date, monthOffset) => (e) => {
      const selectedMonth = Number(e.target.value);
      const month = dateLib.setMonth(dateLib.startOfMonth(date), selectedMonth);
      goToMonth(dateLib.addMonths(month, -monthOffset));
    }, [dateLib, goToMonth]);
    const handleYearChange = (0, import_react33.useCallback)((date, monthOffset) => (e) => {
      const selectedYear = Number(e.target.value);
      const month = dateLib.setYear(dateLib.startOfMonth(date), selectedYear);
      goToMonth(dateLib.addMonths(month, -monthOffset));
    }, [dateLib, goToMonth]);
    const { className, style } = (0, import_react33.useMemo)(() => ({
      className: [classNames[UI.Root], props.className].filter(Boolean).join(" "),
      style: { ...styles?.[UI.Root], ...props.style }
    }), [classNames, props.className, props.style, styles]);
    const dataAttributes = getDataAttributes(props);
    const getDropdownStyle = (dropdown) => {
      const dropdownStyle = styles?.[UI.Dropdown];
      const specificDropdownStyle = styles?.[dropdown];
      if (!dropdownStyle && !specificDropdownStyle) {
        return void 0;
      }
      return {
        ...dropdownStyle,
        ...specificDropdownStyle
      };
    };
    const rootElRef = (0, import_react33.useRef)(null);
    useAnimation(rootElRef, Boolean(props.animate), {
      classNames,
      months,
      focused,
      dateLib
    });
    const contextValue = {
      dayPickerProps: props,
      selected: selectedValue,
      select,
      isSelected,
      months,
      nextMonth,
      previousMonth,
      goToMonth,
      getModifiers,
      components,
      classNames,
      styles,
      labels,
      formatters: formatters2
    };
    return import_react33.default.createElement(
      dayPickerContext.Provider,
      { value: contextValue },
      import_react33.default.createElement(
        components.Root,
        { rootRef: props.animate ? rootElRef : void 0, className, style, dir: props.dir, id: props.id, lang: props.lang ?? locale.code, nonce: props.nonce, title: props.title, role: props.role, "aria-label": props["aria-label"], "aria-labelledby": props["aria-labelledby"], ...dataAttributes },
        import_react33.default.createElement(
          components.Months,
          { className: classNames[UI.Months], style: styles?.[UI.Months] },
          !props.hideNavigation && !navLayout && import_react33.default.createElement(components.Nav, { "data-animated-nav": props.animate ? "true" : void 0, className: classNames[UI.Nav], style: styles?.[UI.Nav], "aria-label": labelNav2(), onPreviousClick: handlePreviousClick, onNextClick: handleNextClick, previousMonth, nextMonth }),
          months.map((calendarMonth, displayIndex) => {
            const monthOffset = props.reverseMonths ? months.length - 1 - displayIndex : displayIndex;
            return import_react33.default.createElement(
              components.Month,
              {
                "data-animated-month": props.animate ? "true" : void 0,
                className: classNames[UI.Month],
                style: styles?.[UI.Month],
                // biome-ignore lint/suspicious/noArrayIndexKey: breaks animation
                key: displayIndex,
                displayIndex,
                calendarMonth
              },
              navLayout === "around" && !props.hideNavigation && displayIndex === 0 && import_react33.default.createElement(
                components.PreviousMonthButton,
                { type: "button", className: classNames[UI.PreviousMonthButton], style: styles?.[UI.PreviousMonthButton], tabIndex: previousMonth ? void 0 : -1, "aria-disabled": previousMonth ? void 0 : true, "aria-label": labelPrevious2(previousMonth), onClick: handlePreviousClick, "data-animated-button": props.animate ? "true" : void 0 },
                import_react33.default.createElement(components.Chevron, { disabled: previousMonth ? void 0 : true, className: classNames[UI.Chevron], style: styles?.[UI.Chevron], orientation: props.dir === "rtl" ? "right" : "left" })
              ),
              import_react33.default.createElement(components.MonthCaption, { "data-animated-caption": props.animate ? "true" : void 0, className: classNames[UI.MonthCaption], style: styles?.[UI.MonthCaption], calendarMonth, displayIndex }, captionLayout?.startsWith("dropdown") ? import_react33.default.createElement(
                components.DropdownNav,
                { className: classNames[UI.Dropdowns], style: styles?.[UI.Dropdowns] },
                (() => {
                  const monthControl = captionLayout === "dropdown" || captionLayout === "dropdown-months" ? import_react33.default.createElement(components.MonthsDropdown, { key: "month", className: classNames[UI.MonthsDropdown], "aria-label": labelMonthDropdown2(), disabled: Boolean(props.disableNavigation), onChange: handleMonthChange(calendarMonth.date, monthOffset), options: getMonthOptions(calendarMonth.date, navStart, navEnd, formatters2, dateLib), style: getDropdownStyle(UI.MonthsDropdown), value: dateLib.getMonth(calendarMonth.date) }) : import_react33.default.createElement("span", { key: "month" }, formatMonthDropdown2(calendarMonth.date, dateLib));
                  const yearControl = captionLayout === "dropdown" || captionLayout === "dropdown-years" ? import_react33.default.createElement(components.YearsDropdown, { key: "year", className: classNames[UI.YearsDropdown], "aria-label": labelYearDropdown2(dateLib.options), disabled: Boolean(props.disableNavigation), onChange: handleYearChange(calendarMonth.date, monthOffset), options: getYearOptions(navStart, navEnd, formatters2, dateLib, Boolean(props.reverseYears)), style: getDropdownStyle(UI.YearsDropdown), value: dateLib.getYear(calendarMonth.date) }) : import_react33.default.createElement("span", { key: "year" }, formatYearDropdown2(calendarMonth.date, dateLib));
                  const controls = dateLib.getMonthYearOrder() === "year-first" ? [yearControl, monthControl] : [monthControl, yearControl];
                  return controls;
                })(),
                import_react33.default.createElement("span", { role: "status", "aria-live": "polite", style: {
                  border: 0,
                  clip: "rect(0 0 0 0)",
                  height: "1px",
                  margin: "-1px",
                  overflow: "hidden",
                  padding: 0,
                  position: "absolute",
                  width: "1px",
                  whiteSpace: "nowrap",
                  wordWrap: "normal"
                } }, formatCaption2(calendarMonth.date, dateLib.options, dateLib))
              ) : import_react33.default.createElement(components.CaptionLabel, { className: classNames[UI.CaptionLabel], style: styles?.[UI.CaptionLabel], role: "status", "aria-live": "polite" }, formatCaption2(calendarMonth.date, dateLib.options, dateLib))),
              navLayout === "around" && !props.hideNavigation && displayIndex === numberOfMonths - 1 && import_react33.default.createElement(
                components.NextMonthButton,
                { type: "button", className: classNames[UI.NextMonthButton], style: styles?.[UI.NextMonthButton], tabIndex: nextMonth ? void 0 : -1, "aria-disabled": nextMonth ? void 0 : true, "aria-label": labelNext2(nextMonth), onClick: handleNextClick, "data-animated-button": props.animate ? "true" : void 0 },
                import_react33.default.createElement(components.Chevron, { disabled: nextMonth ? void 0 : true, className: classNames[UI.Chevron], style: styles?.[UI.Chevron], orientation: props.dir === "rtl" ? "left" : "right" })
              ),
              displayIndex === numberOfMonths - 1 && navLayout === "after" && !props.hideNavigation && import_react33.default.createElement(components.Nav, { "data-animated-nav": props.animate ? "true" : void 0, className: classNames[UI.Nav], style: styles?.[UI.Nav], "aria-label": labelNav2(), onPreviousClick: handlePreviousClick, onNextClick: handleNextClick, previousMonth, nextMonth }),
              import_react33.default.createElement(
                components.MonthGrid,
                { role: "grid", "aria-multiselectable": mode === "multiple" || mode === "range", "aria-label": labelGrid2(calendarMonth.date, dateLib.options, dateLib) || void 0, className: classNames[UI.MonthGrid], style: styles?.[UI.MonthGrid] },
                !props.hideWeekdays && import_react33.default.createElement(
                  components.Weekdays,
                  { "data-animated-weekdays": props.animate ? "true" : void 0, className: classNames[UI.Weekdays], style: styles?.[UI.Weekdays] },
                  showWeekNumber && import_react33.default.createElement(components.WeekNumberHeader, { "aria-label": labelWeekNumberHeader2(dateLib.options), className: classNames[UI.WeekNumberHeader], style: styles?.[UI.WeekNumberHeader], scope: "col" }, formatWeekNumberHeader2()),
                  weekdays.map((weekday) => import_react33.default.createElement(components.Weekday, { "aria-label": labelWeekday2(weekday, dateLib.options, dateLib), className: classNames[UI.Weekday], key: String(weekday), style: styles?.[UI.Weekday], scope: "col" }, formatWeekdayName2(weekday, dateLib.options, dateLib)))
                ),
                import_react33.default.createElement(components.Weeks, { "data-animated-weeks": props.animate ? "true" : void 0, className: classNames[UI.Weeks], style: styles?.[UI.Weeks] }, calendarMonth.weeks.map((week) => {
                  return import_react33.default.createElement(
                    components.Week,
                    { className: classNames[UI.Week], key: week.weekNumber, style: styles?.[UI.Week], week },
                    showWeekNumber && import_react33.default.createElement(components.WeekNumber, { week, style: styles?.[UI.WeekNumber], "aria-label": labelWeekNumber2(week.weekNumber, {
                      locale
                    }), className: classNames[UI.WeekNumber], scope: "row", role: "rowheader" }, formatWeekNumber2(week.weekNumber, dateLib)),
                    week.days.map((day) => {
                      const { date } = day;
                      const modifiers = getModifiers(day);
                      modifiers[DayFlag.focused] = !modifiers.hidden && Boolean(focused?.isEqualTo(day));
                      modifiers[SelectionState.selected] = isSelected?.(date) || modifiers.selected;
                      if (isDateRange(selectedValue)) {
                        const { from, to } = selectedValue;
                        modifiers[SelectionState.range_start] = Boolean(from && to && dateLib.isSameDay(date, from));
                        modifiers[SelectionState.range_end] = Boolean(from && to && dateLib.isSameDay(date, to));
                        modifiers[SelectionState.range_middle] = rangeIncludesDate(selectedValue, date, true, dateLib);
                      }
                      const style2 = getStyleForModifiers(modifiers, styles, props.modifiersStyles);
                      const className2 = getClassNamesForModifiers(modifiers, classNames, props.modifiersClassNames);
                      const ariaLabel = !isInteractive && !modifiers.hidden ? labelGridcell2(date, modifiers, dateLib.options, dateLib) : void 0;
                      return import_react33.default.createElement(components.Day, { key: `${day.isoDate}_${day.displayMonthId}`, day, modifiers, className: className2.join(" "), style: style2, role: "gridcell", "aria-selected": modifiers.selected || void 0, "aria-label": ariaLabel, "data-day": day.isoDate, "data-month": day.outside ? day.dateMonthId : void 0, "data-selected": modifiers.selected || void 0, "data-disabled": modifiers.disabled || void 0, "data-hidden": modifiers.hidden || void 0, "data-outside": day.outside || void 0, "data-focused": modifiers.focused || void 0, "data-today": modifiers.today || void 0 }, !modifiers.hidden && isInteractive ? import_react33.default.createElement(components.DayButton, { className: classNames[UI.DayButton], style: styles?.[UI.DayButton], type: "button", day, modifiers, disabled: !modifiers.focused && modifiers.disabled || void 0, "aria-disabled": modifiers.focused && modifiers.disabled || void 0, tabIndex: isFocusTarget(day) ? 0 : -1, "aria-label": labelDayButton2(date, modifiers, dateLib.options, dateLib), onClick: handleDayClick(day, modifiers), onBlur: handleDayBlur(day, modifiers), onFocus: handleDayFocus(day, modifiers), onKeyDown: handleDayKeyDown(day, modifiers), onMouseEnter: handleDayMouseEnter(day, modifiers), onMouseLeave: handleDayMouseLeave(day, modifiers) }, formatDay2(date, dateLib.options, dateLib)) : !modifiers.hidden && formatDay2(day.date, dateLib.options, dateLib));
                    })
                  );
                }))
              )
            );
          })
        ),
        props.footer && import_react33.default.createElement(components.Footer, { className: classNames[UI.Footer], style: styles?.[UI.Footer], role: "status", "aria-live": "polite" }, props.footer)
      )
    );
  }

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/lucide-react.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
  init_define_import_meta_env();
  var import_react36 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
  init_define_import_meta_env();
  var mergeClasses = (...classes) => classes.filter((className, index2, array) => {
    return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index2;
  }).join(" ").trim();

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
  init_define_import_meta_env();
  var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
  init_define_import_meta_env();

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
  init_define_import_meta_env();
  var toCamelCase = (string) => string.replace(
    /^([A-Z])|[\s-_]+(\w)/g,
    (match2, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
  );

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
  var toPascalCase = (string) => {
    const camelCase = toCamelCase(string);
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  };

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/Icon.mjs
  init_define_import_meta_env();
  var import_react35 = __toESM(require_react_shim(), 1);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
  init_define_import_meta_env();
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
  init_define_import_meta_env();
  var hasA11yProp = (props) => {
    for (const prop in props) {
      if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
        return true;
      }
    }
    return false;
  };

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/context.mjs
  init_define_import_meta_env();
  var import_react34 = __toESM(require_react_shim(), 1);
  var LucideContext = (0, import_react34.createContext)({});
  var useLucideContext = () => (0, import_react34.useContext)(LucideContext);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/Icon.mjs
  var Icon = (0, import_react35.forwardRef)(
    ({ color, size: size4, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
      const {
        size: contextSize = 24,
        strokeWidth: contextStrokeWidth = 2,
        absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
        color: contextColor = "currentColor",
        className: contextClass = ""
      } = useLucideContext() ?? {};
      const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size4 ?? contextSize) : strokeWidth ?? contextStrokeWidth;
      return (0, import_react35.createElement)(
        "svg",
        {
          ref,
          ...defaultAttributes,
          width: size4 ?? contextSize ?? defaultAttributes.width,
          height: size4 ?? contextSize ?? defaultAttributes.height,
          stroke: color ?? contextColor,
          strokeWidth: calculatedStrokeWidth,
          className: mergeClasses("lucide", contextClass, className),
          ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
          ...rest
        },
        [
          ...iconNode.map(([tag, attrs]) => (0, import_react35.createElement)(tag, attrs)),
          ...Array.isArray(children) ? children : [children]
        ]
      );
    }
  );

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
  var createLucideIcon = (iconName, iconNode) => {
    const Component = (0, import_react36.forwardRef)(
      ({ className, ...props }, ref) => (0, import_react36.createElement)(Icon, {
        ref,
        iconNode,
        className: mergeClasses(
          `lucide-${toKebabCase(toPascalCase(iconName))}`,
          `lucide-${iconName}`,
          className
        ),
        ...props
      })
    );
    Component.displayName = toPascalCase(iconName);
    return Component;
  };

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/icons/check.mjs
  init_define_import_meta_env();
  var __iconNode = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
  var Check = createLucideIcon("check", __iconNode);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/icons/chevron-down.mjs
  init_define_import_meta_env();
  var __iconNode2 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
  var ChevronDown = createLucideIcon("chevron-down", __iconNode2);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/icons/chevron-left.mjs
  init_define_import_meta_env();
  var __iconNode3 = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]];
  var ChevronLeft = createLucideIcon("chevron-left", __iconNode3);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs
  init_define_import_meta_env();
  var __iconNode4 = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]];
  var ChevronRight = createLucideIcon("chevron-right", __iconNode4);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/icons/chevron-up.mjs
  init_define_import_meta_env();
  var __iconNode5 = [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]];
  var ChevronUp = createLucideIcon("chevron-up", __iconNode5);

  // node_modules/.pnpm/lucide-react@1.31.0_react@19.2.8/node_modules/lucide-react/dist/esm/icons/x.mjs
  init_define_import_meta_env();
  var __iconNode6 = [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ];
  var X = createLucideIcon("x", __iconNode6);

  // src/components/ui/calendar.tsx
  function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    captionLayout = "label",
    buttonVariant = "ghost",
    locale,
    formatters: formatters2,
    components,
    ...props
  }) {
    const defaultClassNames = getDefaultClassNames();
    return /* @__PURE__ */ React72.createElement(
      DayPicker,
      {
        showOutsideDays,
        className: cn(
          "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
          String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
          String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
          className
        ),
        captionLayout,
        locale,
        formatters: {
          formatMonthDropdown: (date) => date.toLocaleString(locale?.code, { month: "short" }),
          ...formatters2
        },
        classNames: {
          root: cn("w-fit", defaultClassNames.root),
          months: cn(
            "relative flex flex-col gap-4 md:flex-row",
            defaultClassNames.months
          ),
          month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
          nav: cn(
            "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
            defaultClassNames.nav
          ),
          button_previous: cn(
            buttonVariants({ variant: buttonVariant }),
            "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
            defaultClassNames.button_previous
          ),
          button_next: cn(
            buttonVariants({ variant: buttonVariant }),
            "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
            defaultClassNames.button_next
          ),
          month_caption: cn(
            "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
            defaultClassNames.month_caption
          ),
          dropdowns: cn(
            "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
            defaultClassNames.dropdowns
          ),
          dropdown_root: cn(
            "relative rounded-(--cell-radius)",
            defaultClassNames.dropdown_root
          ),
          dropdown: cn(
            "absolute inset-0 bg-popover opacity-0",
            defaultClassNames.dropdown
          ),
          caption_label: cn(
            "font-medium select-none",
            captionLayout === "label" ? "text-sm" : "flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
            defaultClassNames.caption_label
          ),
          month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
          weekdays: cn("flex", defaultClassNames.weekdays),
          weekday: cn(
            "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
            defaultClassNames.weekday
          ),
          week: cn("mt-2 flex w-full", defaultClassNames.week),
          week_number_header: cn(
            "w-(--cell-size) select-none",
            defaultClassNames.week_number_header
          ),
          week_number: cn(
            "text-[0.8rem] text-muted-foreground select-none",
            defaultClassNames.week_number
          ),
          day: cn(
            "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
            props.showWeekNumber ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)" : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
            defaultClassNames.day
          ),
          range_start: cn(
            "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
            defaultClassNames.range_start
          ),
          range_middle: cn("rounded-none", defaultClassNames.range_middle),
          range_end: cn(
            "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
            defaultClassNames.range_end
          ),
          today: cn(
            "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none",
            defaultClassNames.today
          ),
          outside: cn(
            "text-muted-foreground aria-selected:text-muted-foreground",
            defaultClassNames.outside
          ),
          disabled: cn(
            "text-muted-foreground opacity-50",
            defaultClassNames.disabled
          ),
          hidden: cn("invisible", defaultClassNames.hidden),
          ...classNames
        },
        components: {
          Root: ({ className: className2, rootRef, ...props2 }) => {
            return /* @__PURE__ */ React72.createElement(
              "div",
              {
                "data-slot": "calendar",
                ref: rootRef,
                className: cn(className2),
                ...props2
              }
            );
          },
          Chevron: ({ className: className2, orientation, ...props2 }) => {
            if (orientation === "left") {
              return /* @__PURE__ */ React72.createElement(ChevronLeft, { className: cn("size-4", className2), ...props2 });
            }
            if (orientation === "right") {
              return /* @__PURE__ */ React72.createElement(
                ChevronRight,
                {
                  className: cn("size-4", className2),
                  ...props2
                }
              );
            }
            return /* @__PURE__ */ React72.createElement(ChevronDown, { className: cn("size-4", className2), ...props2 });
          },
          DayButton: ({ ...props2 }) => /* @__PURE__ */ React72.createElement(CalendarDayButton, { locale, ...props2 }),
          WeekNumber: ({ children, ...props2 }) => {
            return /* @__PURE__ */ React72.createElement("td", { ...props2 }, /* @__PURE__ */ React72.createElement("div", { className: "flex size-(--cell-size) items-center justify-center text-center" }, children));
          },
          ...components
        },
        ...props
      }
    );
  }
  function CalendarDayButton({
    className,
    day,
    modifiers,
    locale,
    ...props
  }) {
    const defaultClassNames = getDefaultClassNames();
    const ref = React72.useRef(null);
    React72.useEffect(() => {
      if (modifiers.focused) ref.current?.focus();
    }, [modifiers.focused]);
    return /* @__PURE__ */ React72.createElement(
      Button,
      {
        ref,
        variant: "ghost",
        size: "icon",
        "data-day": day.date.toLocaleDateString(locale?.code),
        "data-selected-single": modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle,
        "data-range-start": modifiers.range_start,
        "data-range-end": modifiers.range_end,
        "data-range-middle": modifiers.range_middle,
        className: cn(
          "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70",
          defaultClassNames.day,
          className
        ),
        ...props
      }
    );
  }

  // src/components/ui/card.tsx
  init_define_import_meta_env();
  var React73 = __toESM(require_react_shim(), 1);
  function Card({
    className,
    size: size4 = "default",
    ...props
  }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card",
        "data-size": size4,
        className: cn(
          "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
          className
        ),
        ...props
      }
    );
  }
  function CardHeader({ className, ...props }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card-header",
        className: cn(
          "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
          className
        ),
        ...props
      }
    );
  }
  function CardTitle({ className, ...props }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card-title",
        className: cn(
          "font-display text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
          className
        ),
        ...props
      }
    );
  }
  function CardDescription({ className, ...props }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card-description",
        className: cn("text-sm text-muted-foreground", className),
        ...props
      }
    );
  }
  function CardAction({ className, ...props }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card-action",
        className: cn(
          "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
          className
        ),
        ...props
      }
    );
  }
  function CardContent({ className, ...props }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card-content",
        className: cn("px-(--card-spacing)", className),
        ...props
      }
    );
  }
  function CardFooter({ className, ...props }) {
    return /* @__PURE__ */ React73.createElement(
      "div",
      {
        "data-slot": "card-footer",
        className: cn(
          "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
          className
        ),
        ...props
      }
    );
  }

  // src/components/ui/checkbox.tsx
  init_define_import_meta_env();
  var React74 = __toESM(require_react_shim(), 1);
  function Checkbox3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React74.createElement(
      dist_exports3.Root,
      {
        "data-slot": "checkbox",
        className: cn(
          "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
          className
        ),
        ...props
      },
      /* @__PURE__ */ React74.createElement(
        dist_exports3.Indicator,
        {
          "data-slot": "checkbox-indicator",
          className: "grid place-content-center text-current transition-none [&>svg]:size-3.5"
        },
        /* @__PURE__ */ React74.createElement(Check, null)
      )
    );
  }

  // src/components/ui/dialog.tsx
  init_define_import_meta_env();
  var React75 = __toESM(require_react_shim(), 1);
  function Dialog2({
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(dist_exports2.Root, { "data-slot": "dialog", ...props });
  }
  function DialogTrigger3({
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(dist_exports2.Trigger, { "data-slot": "dialog-trigger", ...props });
  }
  function DialogPortal2({
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(dist_exports2.Portal, { "data-slot": "dialog-portal", ...props });
  }
  function DialogClose3({
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(dist_exports2.Close, { "data-slot": "dialog-close", ...props });
  }
  function DialogOverlay3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(
      dist_exports2.Overlay,
      {
        "data-slot": "dialog-overlay",
        className: cn(
          "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        ),
        ...props
      }
    );
  }
  function DialogContent3({
    className,
    children,
    showCloseButton = true,
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(DialogPortal2, null, /* @__PURE__ */ React75.createElement(DialogOverlay3, null), /* @__PURE__ */ React75.createElement(
      dist_exports2.Content,
      {
        "data-slot": "dialog-content",
        className: cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        ),
        ...props
      },
      children,
      showCloseButton && /* @__PURE__ */ React75.createElement(dist_exports2.Close, { "data-slot": "dialog-close", asChild: true }, /* @__PURE__ */ React75.createElement(
        Button,
        {
          variant: "ghost",
          className: "absolute top-2 right-2",
          size: "icon-sm"
        },
        /* @__PURE__ */ React75.createElement(X, null),
        /* @__PURE__ */ React75.createElement("span", { className: "sr-only" }, "Close")
      ))
    ));
  }
  function DialogHeader({ className, ...props }) {
    return /* @__PURE__ */ React75.createElement(
      "div",
      {
        "data-slot": "dialog-header",
        className: cn("flex flex-col gap-2", className),
        ...props
      }
    );
  }
  function DialogFooter({
    className,
    showCloseButton = false,
    children,
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(
      "div",
      {
        "data-slot": "dialog-footer",
        className: cn(
          "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
          className
        ),
        ...props
      },
      children,
      showCloseButton && /* @__PURE__ */ React75.createElement(dist_exports2.Close, { asChild: true }, /* @__PURE__ */ React75.createElement(Button, { variant: "outline" }, "Close"))
    );
  }
  function DialogTitle3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(
      dist_exports2.Title,
      {
        "data-slot": "dialog-title",
        className: cn(
          "font-display text-base leading-none font-medium",
          className
        ),
        ...props
      }
    );
  }
  function DialogDescription3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React75.createElement(
      dist_exports2.Description,
      {
        "data-slot": "dialog-description",
        className: cn(
          "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          className
        ),
        ...props
      }
    );
  }

  // src/components/ui/dropdown-menu.tsx
  init_define_import_meta_env();
  var React76 = __toESM(require_react_shim(), 1);
  function DropdownMenu2({
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(dist_exports7.Root, { "data-slot": "dropdown-menu", ...props });
  }
  function DropdownMenuPortal2({
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(dist_exports7.Portal, { "data-slot": "dropdown-menu-portal", ...props });
  }
  function DropdownMenuTrigger3({
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.Trigger,
      {
        "data-slot": "dropdown-menu-trigger",
        ...props
      }
    );
  }
  function DropdownMenuContent3({
    className,
    align = "start",
    sideOffset = 4,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(dist_exports7.Portal, null, /* @__PURE__ */ React76.createElement(
      dist_exports7.Content,
      {
        "data-slot": "dropdown-menu-content",
        sideOffset,
        align,
        className: cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        ),
        ...props
      }
    ));
  }
  function DropdownMenuGroup3({
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(dist_exports7.Group, { "data-slot": "dropdown-menu-group", ...props });
  }
  function DropdownMenuItem3({
    className,
    inset,
    variant = "default",
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.Item,
      {
        "data-slot": "dropdown-menu-item",
        "data-inset": inset,
        "data-variant": variant,
        className: cn(
          "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
          className
        ),
        ...props
      }
    );
  }
  function DropdownMenuCheckboxItem3({
    className,
    children,
    checked,
    inset,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.CheckboxItem,
      {
        "data-slot": "dropdown-menu-checkbox-item",
        "data-inset": inset,
        className: cn(
          "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
        checked,
        ...props
      },
      /* @__PURE__ */ React76.createElement(
        "span",
        {
          className: "pointer-events-none absolute right-2 flex items-center justify-center",
          "data-slot": "dropdown-menu-checkbox-item-indicator"
        },
        /* @__PURE__ */ React76.createElement(dist_exports7.ItemIndicator, null, /* @__PURE__ */ React76.createElement(Check, null))
      ),
      children
    );
  }
  function DropdownMenuRadioGroup3({
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.RadioGroup,
      {
        "data-slot": "dropdown-menu-radio-group",
        ...props
      }
    );
  }
  function DropdownMenuRadioItem3({
    className,
    children,
    inset,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.RadioItem,
      {
        "data-slot": "dropdown-menu-radio-item",
        "data-inset": inset,
        className: cn(
          "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
        ...props
      },
      /* @__PURE__ */ React76.createElement(
        "span",
        {
          className: "pointer-events-none absolute right-2 flex items-center justify-center",
          "data-slot": "dropdown-menu-radio-item-indicator"
        },
        /* @__PURE__ */ React76.createElement(dist_exports7.ItemIndicator, null, /* @__PURE__ */ React76.createElement(Check, null))
      ),
      children
    );
  }
  function DropdownMenuLabel3({
    className,
    inset,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.Label,
      {
        "data-slot": "dropdown-menu-label",
        "data-inset": inset,
        className: cn(
          "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
          className
        ),
        ...props
      }
    );
  }
  function DropdownMenuSeparator3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.Separator,
      {
        "data-slot": "dropdown-menu-separator",
        className: cn("-mx-1 my-1 h-px bg-border", className),
        ...props
      }
    );
  }
  function DropdownMenuShortcut({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      "span",
      {
        "data-slot": "dropdown-menu-shortcut",
        className: cn(
          "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
          className
        ),
        ...props
      }
    );
  }
  function DropdownMenuSub2({
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(dist_exports7.Sub, { "data-slot": "dropdown-menu-sub", ...props });
  }
  function DropdownMenuSubTrigger3({
    className,
    inset,
    children,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.SubTrigger,
      {
        "data-slot": "dropdown-menu-sub-trigger",
        "data-inset": inset,
        className: cn(
          "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
        ...props
      },
      children,
      /* @__PURE__ */ React76.createElement(ChevronRight, { className: "ml-auto" })
    );
  }
  function DropdownMenuSubContent3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React76.createElement(
      dist_exports7.SubContent,
      {
        "data-slot": "dropdown-menu-sub-content",
        className: cn(
          "z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        ),
        ...props
      }
    );
  }

  // src/components/ui/input.tsx
  init_define_import_meta_env();
  var React77 = __toESM(require_react_shim(), 1);
  function Input({ className, type, ...props }) {
    return /* @__PURE__ */ React77.createElement(
      "input",
      {
        type,
        "data-slot": "input",
        className: cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        ),
        ...props
      }
    );
  }

  // src/components/ui/label.tsx
  init_define_import_meta_env();
  var React78 = __toESM(require_react_shim(), 1);
  function Label4({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React78.createElement(
      dist_exports9.Root,
      {
        "data-slot": "label",
        className: cn(
          "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          className
        ),
        ...props
      }
    );
  }

  // src/components/ui/popover.tsx
  init_define_import_meta_env();
  var React79 = __toESM(require_react_shim(), 1);
  function Popover2({
    ...props
  }) {
    return /* @__PURE__ */ React79.createElement(dist_exports10.Root, { "data-slot": "popover", ...props });
  }
  function PopoverTrigger3({
    ...props
  }) {
    return /* @__PURE__ */ React79.createElement(dist_exports10.Trigger, { "data-slot": "popover-trigger", ...props });
  }
  function PopoverContent3({
    className,
    align = "center",
    sideOffset = 4,
    ...props
  }) {
    return /* @__PURE__ */ React79.createElement(dist_exports10.Portal, null, /* @__PURE__ */ React79.createElement(
      dist_exports10.Content,
      {
        "data-slot": "popover-content",
        align,
        sideOffset,
        className: cn(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        ),
        ...props
      }
    ));
  }
  function PopoverAnchor3({
    ...props
  }) {
    return /* @__PURE__ */ React79.createElement(dist_exports10.Anchor, { "data-slot": "popover-anchor", ...props });
  }
  function PopoverHeader({ className, ...props }) {
    return /* @__PURE__ */ React79.createElement(
      "div",
      {
        "data-slot": "popover-header",
        className: cn("flex flex-col gap-0.5 text-sm", className),
        ...props
      }
    );
  }
  function PopoverTitle({ className, ...props }) {
    return /* @__PURE__ */ React79.createElement(
      "div",
      {
        "data-slot": "popover-title",
        className: cn("font-medium", className),
        ...props
      }
    );
  }
  function PopoverDescription({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React79.createElement(
      "p",
      {
        "data-slot": "popover-description",
        className: cn("text-muted-foreground", className),
        ...props
      }
    );
  }

  // src/components/ui/select.tsx
  init_define_import_meta_env();
  var React80 = __toESM(require_react_shim(), 1);
  function Select3({
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(dist_exports11.Root, { "data-slot": "select", ...props });
  }
  function SelectGroup3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.Group,
      {
        "data-slot": "select-group",
        className: cn("scroll-my-1 p-1", className),
        ...props
      }
    );
  }
  function SelectValue3({
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(dist_exports11.Value, { "data-slot": "select-value", ...props });
  }
  function SelectTrigger3({
    className,
    size: size4 = "default",
    children,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.Trigger,
      {
        "data-slot": "select-trigger",
        "data-size": size4,
        className: cn(
          "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
        ...props
      },
      children,
      /* @__PURE__ */ React80.createElement(dist_exports11.Icon, { asChild: true }, /* @__PURE__ */ React80.createElement(ChevronDown, { className: "pointer-events-none size-4 text-muted-foreground" }))
    );
  }
  function SelectContent3({
    className,
    children,
    position = "item-aligned",
    align = "center",
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(dist_exports11.Portal, null, /* @__PURE__ */ React80.createElement(
      dist_exports11.Content,
      {
        "data-slot": "select-content",
        "data-align-trigger": position === "item-aligned",
        className: cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        ),
        position,
        align,
        ...props
      },
      /* @__PURE__ */ React80.createElement(SelectScrollUpButton3, null),
      /* @__PURE__ */ React80.createElement(
        dist_exports11.Viewport,
        {
          "data-position": position,
          className: cn(
            "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
            position === "popper" && ""
          )
        },
        children
      ),
      /* @__PURE__ */ React80.createElement(SelectScrollDownButton3, null)
    ));
  }
  function SelectLabel3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.Label,
      {
        "data-slot": "select-label",
        className: cn("px-1.5 py-1 text-xs text-muted-foreground", className),
        ...props
      }
    );
  }
  function SelectItem3({
    className,
    children,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.Item,
      {
        "data-slot": "select-item",
        className: cn(
          "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
          className
        ),
        ...props
      },
      /* @__PURE__ */ React80.createElement("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center" }, /* @__PURE__ */ React80.createElement(dist_exports11.ItemIndicator, null, /* @__PURE__ */ React80.createElement(Check, { className: "pointer-events-none" }))),
      /* @__PURE__ */ React80.createElement(dist_exports11.ItemText, null, children)
    );
  }
  function SelectSeparator3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.Separator,
      {
        "data-slot": "select-separator",
        className: cn("pointer-events-none -mx-1 my-1 h-px bg-border", className),
        ...props
      }
    );
  }
  function SelectScrollUpButton3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.ScrollUpButton,
      {
        "data-slot": "select-scroll-up-button",
        className: cn(
          "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
        ...props
      },
      /* @__PURE__ */ React80.createElement(ChevronUp, null)
    );
  }
  function SelectScrollDownButton3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React80.createElement(
      dist_exports11.ScrollDownButton,
      {
        "data-slot": "select-scroll-down-button",
        className: cn(
          "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
        ...props
      },
      /* @__PURE__ */ React80.createElement(ChevronDown, null)
    );
  }

  // src/components/ui/table.tsx
  init_define_import_meta_env();
  var React81 = __toESM(require_react_shim(), 1);
  function Table({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "div",
      {
        "data-slot": "table-container",
        className: "relative w-full overflow-x-auto"
      },
      /* @__PURE__ */ React81.createElement(
        "table",
        {
          "data-slot": "table",
          className: cn("w-full caption-bottom text-sm", className),
          ...props
        }
      )
    );
  }
  function TableHeader({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "thead",
      {
        "data-slot": "table-header",
        className: cn("[&_tr]:border-b", className),
        ...props
      }
    );
  }
  function TableBody({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "tbody",
      {
        "data-slot": "table-body",
        className: cn("[&_tr:last-child]:border-0", className),
        ...props
      }
    );
  }
  function TableFooter({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "tfoot",
      {
        "data-slot": "table-footer",
        className: cn(
          "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
          className
        ),
        ...props
      }
    );
  }
  function TableRow({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "tr",
      {
        "data-slot": "table-row",
        className: cn(
          "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
          className
        ),
        ...props
      }
    );
  }
  function TableHead({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "th",
      {
        "data-slot": "table-head",
        className: cn(
          "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
          className
        ),
        ...props
      }
    );
  }
  function TableCell({ className, ...props }) {
    return /* @__PURE__ */ React81.createElement(
      "td",
      {
        "data-slot": "table-cell",
        className: cn(
          "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
          className
        ),
        ...props
      }
    );
  }
  function TableCaption({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React81.createElement(
      "caption",
      {
        "data-slot": "table-caption",
        className: cn("mt-4 text-sm text-muted-foreground", className),
        ...props
      }
    );
  }

  // src/components/ui/tabs.tsx
  init_define_import_meta_env();
  var React82 = __toESM(require_react_shim(), 1);
  function Tabs3({
    className,
    orientation = "horizontal",
    ...props
  }) {
    return /* @__PURE__ */ React82.createElement(
      dist_exports12.Root,
      {
        "data-slot": "tabs",
        "data-orientation": orientation,
        className: cn(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          className
        ),
        ...props
      }
    );
  }
  var tabsListVariants = cva(
    "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
    {
      variants: {
        variant: {
          default: "bg-muted",
          line: "gap-1 bg-transparent"
        }
      },
      defaultVariants: {
        variant: "default"
      }
    }
  );
  function TabsList3({
    className,
    variant = "default",
    ...props
  }) {
    return /* @__PURE__ */ React82.createElement(
      dist_exports12.List,
      {
        "data-slot": "tabs-list",
        "data-variant": variant,
        className: cn(tabsListVariants({ variant }), className),
        ...props
      }
    );
  }
  function TabsTrigger3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React82.createElement(
      dist_exports12.Trigger,
      {
        "data-slot": "tabs-trigger",
        className: cn(
          "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
          "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
          "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
          className
        ),
        ...props
      }
    );
  }
  function TabsContent3({
    className,
    ...props
  }) {
    return /* @__PURE__ */ React82.createElement(
      dist_exports12.Content,
      {
        "data-slot": "tabs-content",
        className: cn("flex-1 text-sm outline-none", className),
        ...props
      }
    );
  }

  // src/components/ui/textarea.tsx
  init_define_import_meta_env();
  var React83 = __toESM(require_react_shim(), 1);
  function Textarea({ className, ...props }) {
    return /* @__PURE__ */ React83.createElement(
      "textarea",
      {
        "data-slot": "textarea",
        className: cn(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        ),
        ...props
      }
    );
  }
  return __toCommonJS(bundle_entry_exports);
})();
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs:
lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs:
lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs:
lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs:
lucide-react/dist/esm/defaultAttributes.mjs:
lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs:
lucide-react/dist/esm/context.mjs:
lucide-react/dist/esm/Icon.mjs:
lucide-react/dist/esm/createLucideIcon.mjs:
lucide-react/dist/esm/icons/check.mjs:
lucide-react/dist/esm/icons/chevron-down.mjs:
lucide-react/dist/esm/icons/chevron-left.mjs:
lucide-react/dist/esm/icons/chevron-right.mjs:
lucide-react/dist/esm/icons/chevron-up.mjs:
lucide-react/dist/esm/icons/x.mjs:
lucide-react/dist/esm/lucide-react.mjs:
  (**
   * @license lucide-react v1.31.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
window.LalamoveUI=LalamoveUI.__dsMainNs?Object.assign({},LalamoveUI,LalamoveUI.__dsMainNs,{__dsMainNs:undefined}):LalamoveUI;
