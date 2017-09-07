# To install

```sh
git clone git@github.com:wvbe/fontoxml-development-tools-module-xml-stats.git
cd fontoxml-development-tools-module-xml-stats
npm install
fdt module --add .
```

# To use

```sh
fdt xml-stats --files ./*/xml
```

```sh
# Read all XML from some-dir, hide the @id attribute stats and do
# not expand the @conref, @keyref and @href attribute values
fdt xml-stats --files ./some-dir/*/*.xml --ignore id --hide conref keyref href
```

```sh
# Find files by a globbing pattern, useful when the "argument list too long"
# or when you really do want to use globbing patterns.
fdt xml-stats --glob "./*.dita!(map)"
```

# Example output

```sh
fdt xml-stats --glob "XMLOps_*/*/DATA/DU/*.xml" --hide-all
```

```
Reading 9631 files (4854ms)
Counting elements in 9631 files (38805ms)
Concatenating statistics for 337549 elements (1455ms)

58331 occs, 17.28%    para
  58331 occs, 100%      @layer
  58331 occs, 100%      @lid
  13178 occs, 22.59%    @code
41098 occs, 12.18%    abb
19537 occs, 5.79%     title
  2282 occs, 11.68%     @ecam
  2282 occs, 11.68%     @ecamimportance
15426 occs, 4.57%     item
  15426 occs, 100%      @layer
14797 occs, 4.38%     entry
  3969 occs, 26.82%     @align
  2321 occs, 15.69%     @rowsep
  2281 occs, 15.42%     @valign
  1369 occs, 9.25%      @nameend
  1369 occs, 9.25%      @namest
  1310 occs, 8.85%      @colsep
  228 occs, 1.54%       @morerows
  94 occs, 0.64%        @colname
9682 occs, 2.87%      duref
  9682 occs, 100%       @product
  9682 occs, 100%       @ref

(... example is truncated ...)

1 occs, 0%            equation
  1 occs, 100%          @code
  1 occs, 100%          @layer
  1 occs, 100%          @lid
1 occs, 0%            m:mspace
1 occs, 0%            example
  1 occs, 100%          @code
  1 occs, 100%          @layer
  1 occs, 100%          @lid

337549  total elements
211  total unique elements
604272  total attributes
```
