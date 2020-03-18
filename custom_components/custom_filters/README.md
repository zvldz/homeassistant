# Custom filters for jinja (Home Assistant)

## Installation
Place the `custom_filters` folder into your `custom_components` folder.
Add "custom_filters:" to your configuration.yaml.

## Filters
<p>

```
unquote     - Replace %xx escapes by their single-character equivalent.
urldecode   - Alias for `unqoute`
ternary     - To use one value on true, one value on false and a third value on null
shuffle     - Randomize an existing list, giving a different order every invocation
```

</p>

## Thanks
https://github.com/AlexxIT
