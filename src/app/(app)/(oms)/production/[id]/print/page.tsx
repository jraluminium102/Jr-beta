import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { PROD_STATUS } from "@/lib/constants";

export const dynamic = "force-dynamic";

// JR logo — base64 PNG embedded (same source as quotation print)
const LOGO_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAADfCAYAAAAqTK2VAABHd0lEQVR42u29ebhdWVWv/Y65mn36Nqk2TaU6CquQJvkEFSWhQKUELyAV9SJ+CBc+bLBHUcQkFCIKKFrygILiFS5g6no/EQTBJgFUBBJUSFFQVFXaqnRn79M3e6+15rh/rHWSUBRVOXufJGetM97nOY9UzFnZe645x/zNMUcDhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYxrdgD4S6hJ89ENqoGYZhGMuJ2BAYVUJBBLSd31vir7i9l2D9bAUv4IvP7Bb/t2EYhrGysMO7UbUTgx6O1vxINwwsgMqjiCAF7QKZhylJxv5qif9Udqm+46LHTSBVkL0QLJN40+K5y/7dFBz5Z7VDnWGUnMJWqB3wHnM/MozyoxDuBP+yaPj2DS360Kwq8hgTXMl3/QWUadV7lrJoMnhTIL5e/Kde8O8n6GUayCnNjm5Ixg8A3N81vOG6hfEjy/1v7QC3ywynYRjncXAykWUCy6j4JPbF1eCRePRAFzx+ARLJ9dNjGQgA14MsyQsUX+TFo0CMcIpszin/Tv6db0bkkFOd9SCuTaHnEd+DuHn0XzKnY9c0G3fugXArZNKheFy8en0wXnNDKLo+9fobNmMNo9z0OnnTSdIHbmpOHlQI5BJ69E1gGcYFZA+E2yA9Fo28tE/ce6fQTJZ4baZLPIUJeL3IC9UDIYS9xbJdQImRx1aR50kG9AAN1TdendRfvxynU4VgJ+jL49EvXo574gy6PPeZhmFcEvTM/9WZesYP3ZDV95gn65GxGCyj9PSfOSi4p8WICupZosA6H2/Xw3AX+3TichGkU/n3Q0Ba6LLqvHnIRsX95rFo1JHUf2s5Tqe7wP8kOjmH+jk0UbM7hlF6nRUhvaMBHz3oBp8uyeR/7IZgu3myTGAZlT1ZTWnFvbJF0H5wzn8vKx6CMXzrcnG/cSge/tdNrfGPLXoIl/qsHbkm1PviNTf0qq5v5feNURti1jCMFUaCJn0iPaEGOxRuxzxYj3goNowyiyq3GdKj3SPrRPQVk3jMQ9KRgMNDOIn6EPdmgHbEFcBVuffLh/hvHxTZtIB6E1eGURnCSVVF5Ae/zki3QKYWdmQCy6icKFDvsziCoZQzXh6jA5GlIKpMn/NHS+aVhTALVF41mad0m70xjGoJCAFmM0RtNExgGZVFJck3caPTkQQ/CJKJvg1gT5t1tgS0CP692ZvoNQzDBJZhlI8kzKaxTXxZxFUNcVOqx5zq1zSvWN92bIWAz2DGDI1hVNJeAPQFdrY1gWVUElGQWqv2A7X8vy3QspPBBJegWhPWOmGDgN/ZhrAsKrdzLBp8cq/ISJK/FzPChlEdW+G7EBT+GUaaanrCBJZRvXWeJ6e5F/UgWMG7jk+kWTfiZuCr8y3516JMw5JF6/7iWjGT4LYBkdE0r01mAsswqoPvEcGLv+tG7mvuz22FxWKZwDIqIgYckB2Jhm/pEX3aBOq9ZRB2TAiSwsyNNKbODnW76lfGU4uNM4zKEigjNgomsIzqIQIaKIMxsjZ9jObOxnkLVwSNO0m5ngbdAU68v8IX17g2soZRLfuboqmKnF5c8zYk33RYNYxy45HUMgiXXWTNFlmA7fyuCKT3MzyIyC9N5YXnrUOOYVTHPvguJBz3enBD0vhzaL9eXpUxD5ZR/mMU6sxztazGU/F+R6fPOcL4rCKZvRjDqKrtNUxgGZUmlaBpo7Bs4ooIxCFJp3Z3Uzj8HV0QecvsNIwqmwzDBJZR2Uks+lobhWUhG0DctPp/mkjDL2t+rdd2BmEowU/047ozsAxCw6ggArGNggkso9pcb0OwPKfRCCQTOX0Lp2c4UwKjrWOtgM5lmLIyjIqKK1R46Jz/NExgGRVc6PM2CsuksABRok6z/gphNm8GxjAqie8CTeF3oP12WiawDGNlCwKxJsLLrlh9J56rB8AfZHAIeMZc/hh7P4ZRsYNYDCKa9dpomMAyKoiALhB6QS/3heiyUWlbXPkICRveHw8C+SDA5g7q2+wCb70hDaO6h7FuxEWaWYC7CSyjqlxGc1ggVasU3jEBSAIL6+cbxxYF7FKfsbvoDXk4Gr55EG6as96QhlE1cZX1IyyofmyqWTtR9IM1+2sCy6gK+4sSDS6SXx4i6PdWyX25SDrxBN6eZ3IqIr8RImuSXKjZezGMiiDgawgK/3ULp2f254WeTWCZwDIM41vguwEPdwjonjYrry/2LXQqt85a2QzDqKaxyAVVr4VlmMAyKkqxuG3uLt/JFBWdW4b34gRmnBlfw6iazVWBcBKftZLs9wX0I1aewQSWUUlBoMCs7eLLOqZuGZ7hi6KvhmFUyz5kg+IkEX/ntUwc3gPhLivRYALLqNQpSj4C2X29vZeB3j6dX/9biYbOjWdH8VJFsCuH49EfGhS5spUHuJvOMowKmd8gPzzdC2e7aRgmsIwKaYFd4GuJG+wSd0MzF1g2hzsUVxkkvoMq7ncXAkvRa3pFej1kFoNlGJU63BKCqMoaG43zJ7QhMMpGK/JTJOrFxFWnRjPrQ8JJ9O5DrfpHFQJpowbWVyA7AHEA3z2NKuZVNIwq2QkNwU2rTjjnPw3wgF0PmsAyKocAREnXd9bALVi22rIMqKKf3pbXFFuyMFIQgex+hvtAXjSvKkWwu2EYFdFYIRLMqE5vXJj4NMB2C3A/L8wDYJROYDnllT0I1mR0ucynvrNzQzLQBKbMoBhG9SxElIuFgwrOSjSYwDKqvNqFaatut0xjCd4r/e3+/s4zxnbiCodG3goPGkbVRIIG6ELq2CHg91oIgAkso7qI2rxdDjzQhThB2zaYzyuMbRSFvzBM0GuV9Q2jUgewrBcJJ2D/pmZ9r0KwrYNepSawDGOlCyzBWw/CzvVVD8iM6tfSUI5rbgs6GVNvL8QwKimyFNr3cpvAMowyKQOlJwKx66hOBZa4BfGfv25h/Ah5YHq7mUFWWd8wqimuiPPazv9mo7F0LIvQKJUo2AHOIzsnVL+zV2R0Fk3kIs3jKl59OZU1yxC0qsBcFQbHPKNG1df8UtZCBNJUPREk+ju6mHRsmMAyKmnsvIKTZGz/wXjkexx8eq24NePqL0rUZSs3LqlAVAHjGcyiqPg7BbQdYVEY3PRw9+hVkvKjUygKYZl3pBDEXHEG5IFGHhJpf405KXFAuIN0EIka+M+vZ/xIsbYt/soEllFlkbUHwk2txj1fi0e+N1b9qRr8yNwFrOq+eGzrwq0ZEIlOq6/COEoKTIfN/6S1uB8s/TEC/oDM+8uke9MCWuoTvwMydDaFeVtpq93MoCAjl4uLUtqb1IkqUyV2+BSHMC/oB817ZQLLWCUURTGdtBr3AD+nXP+aE9x3wRZ/L7gENIjWvLCp+kSEnxfoqoC18b1Z1N3hRsRAUnuuCF7O6pQykgyJi+qa7phqjd+ZQhRCYqtt9TEFwQBk/V1DT03VPXtcNVNdUqZtLkZEr4uR21u5F6t068IXnzmNmp+SpD0vtyl1wyjvCcsVk/iiupSOxaOTDgbS8laST4Zw0aTqn1ydjP3MfnBb2hATxZVBdiwa/diQyA+Mo2kZD20Kvoa4RPWwT7ofv4Fj5sEyOuZLDA6vj8L/bIqsa+XeXVemNdGDuAXV+5vxwndfOzt7mtzemchaAubBMsp8OvCFMZALqXLOsSjuKOtiz3zpU+aKmgzTAtm+zgy/qmij7Gc1yU/swcPElR1AV+fB7cwdIRDsX+Lvj0JwDdfrsWj8F2ORDdNoKiXbax34CNIF3G9fNzt7cg+EVv/KBJaxOoWWXuDns2hgjoXzL+tDemZKaDT5JuWgtQ42IQH0Qa7sEW2tTeXMvlRawQkcXcyoLOaUndZXpz0516604x1P4D6OMPqTM98wvUojMNVBOImm9ye9HwTYam3JOrErhmE8Gv273RVEnhAjYZnjEQRI888/0YntEMg0XHhSn8izJ1FPeTOmfA00Fd4soHutFYjRvjgJFNzBeOSFfSIDGZqV7eAhkPWKAPqhq4lUIbCrQRNYhnHB7aeiYyXfANRBNEk200r82wA2d+D6TwuxJuUeE2KQUK1atdHRPBKB7OtcH8XIBxN0IMkPImVbHhoh6kU/fSP3NfebTmgbuyI0jPMwnHeBP81ofwueunABS0JcRIIWruPkgEB0tsylGYpiim4GPeWRe/RMOJZhLM1GAO4ABN1RY3cNF86hmSuZN7RI+IgmvD5YS+IPAGyxbNq2MWVqGI+NbIesGbeu7BZ51nQusMp6jZT1i0NV3n4T9dk9eSZgW+7/HeAUt6Xk79b3IG4aveeaZOyLdNYyyFil7M2v0bKe2vC2EXE/NItKGYuMCvgu0JbqG6/k5Oxuuy43gWUYF2WxxDo+i/oyWxwBDUBx2YMCvr8D79Mu8Cr8dNlT7RQIkNEdZg+N9uZPsBWyrzO8flDd/57K23eV87RBfl3unNYB1lomrQksw7jwugSyVvyKXsRpiTNqlLwdjFc30u4zilOtPxKOfEc/cm4+D+QttS1Rz7t2mefKWPp6EvLYK+2P3c4A6WuVM+4KBd+FBNPoicz5zyu4rZY9aALLMC60wFIQUXl6fFanlHEz0BAJplQbzssnADa3YUDXFhtKJnp9L3JZq7wFV8++YMk+Y9PcWOq0uSsXU+lD8eifD+BeNoWmrrzXaloDmYG3X7swcXhRONprNoFlGBfWkoJ6yd3mZT5wR+BmVRsb0voXiu/VttdGRFqtkmcQLgrPTKXPZrmxFPZBuB2yQ/Hwe4fF/eQYPpGSJ44pEGn2cbWrwWXBsggN49ENjgA6weDwAnJtk3IX1MzjjRBdhmBuwTcFJyV/v8QgkW0oxhK4F2o3QvNgtPZJA+hL6+pL2SbqnANk2o+4WWVPmNTuJw/at8rtHWIeLMN4jDUikE2F0bf3474rptwFNRfLk/d3Iq5On7k2cNeXPGgp60fctPp/ilP3JS1iy2zKG4+xhlwurgaf1CP+n1topiWNu1okLQqktlxyx5WcnMWuBk1gGcZFM6qSjTXRsl+HaQzq4V1wJlh9yWyHTMEF6n5lvsR2RPIK7pLi5tZSn8ZiToxHF1ZnPL/HozVv6ZXwkw4ZbhY1sEr81dJhnEyr33tNc/Ize3JPnB00lgG7IjSM89qM5cfLHsitoL0gE6L/CTCebwpZe+OBP4zO1ko8JArBHIpH/4+e6e9rGN8srCjqXAH+wXjkL0eRl5xCyVDvSu6oEJAUP4+6nQKptcZZPsyDZRjnYWBF5LllF1cxuGn0OOoOKcgr2xBXWtiMQ9Gap/SIjCb5SLetKssuAKat9d9ZczfrQewuxAZAugeDo0fi8aO/6+JFu77Ds2pBpGoKrWdIxMGvN0wjEMrIYpNdLkJ6p7HSTFITEe/eZfN9uXlIXzAB6cBBaayFpQQHTRnmhNIjbO5TklxAhz6GI+HuGv0Cq7pMexMnVi6xB1EWQS5bS0oVlFSzDGCuR7PrSQJZKn5Mzp1UqYKLX/WILrONoPqJIRhQQsyRpw8A8bmTwF0MIxoIxIEtPiJrqm+OFdmMMkTk+N3jEDjWAi2HgMGpBoNaqiZJAf1t/p1lsJLqW/JnX6FhWWjuEpqF0HqkrOCgTJ9SuJST3dP0jUeFCAlLTuNrXvRiGcWdkFcJdLmCbBJXpJtm9X7Iub+rMFqdMn6PEV6H4jFoLNiJMAhP1G3bJNkasazlVGJAWJUSAarU+B4IyFR4h1Wr9Bm4pFm3iuvTMxcVWiE3aH3LF8u6rVkj9gPsT5F0Ye/0EJ7yoFEFaRnBnTq+kITKtLEjXaIMCZ+V4h/L5T2YxeSYcxAUXdCHe/XNiGHhxIpjBlGT/Z9FmAZFISB0RpQINd6+/r2ioJiNvGSVkp/FBXRFHVjQCxF5Zb4hX5E/BxlFZ9q/KIZN4X1U5XWBR+jaME0eqhBJKIL3m1gbEV5VJlbW3FLT6fqocOiqkfqFkPoTR5iXq5W7I3EarfhNSqKqmpP7I9LNHpGa3IcXF/FU7bBYOqF3h07L9bCSqlHsCioOxHdmKHpV+Yp9NVq7lRXxEn5SdM7hSECTifg4CxLHfkPa4yIJaL27bCbZf9OAqQWJUOHNEzinbBMI3AIRWLRxEYXaX6IJ3YwViFdQpvLHZi3S1q13O1bqrBRFWTFpAKVhA6tNKbODnW76lfGU4uNM4zKEigjNgomsIzqIQIaKIMxsjZ9jObOxnkLVwSNO0m5ngbdAU68v8IX17g2soZRLfuboqmKnF5c8zYk33RYNYxy45HUMgiXXWTNFlmA7fyuCKT3MzyIyC9N5YXnrUOOYVTHPvguJBz3enBD0vhzaL9eXpUxD5ZR/mMU6sxztazGU/F+R6fPOcL4rCKZvRjDqKrtNUxgGZUmlaBpo7Bs4ooIxCFJp3Z3Uzj8HV0QecvsNIwqmwzDBJZR2Uks+lobhWUhG0DctPp/mkjDL2t+rdd2BmEowU/047ozsAxCw6ggArGNggkso9pcb0OwPKfRCCQTOX0Lp2c4UwKjrWOtgM5lmLIyjIqKK1R46Jz/NExgGRVc6PM2CsuksABRok6z/gphNm8GxjAqie8CTeF3oP12WiawDGNlCwKxJsLLrlh9J56rB8AfZHAIeMZc/hh7P4ZRsYNYDCKa9dpomMAyKoiALhB6QS/3heiyUWlbXPkICRveHw8C+SDA5g7q2+wCb70hDaO6h7FuxEWaWYC7CSyjqlxGc1ggVasU3jEBSAIL6+cbxxYF7FKfsbvoDXk4Gr55EG6as96QhlE1cZX1IyyofmyqWTtR9IM1+2sCy6gK+4sSDS6SXx4i6PdWyX25SDrxBN6eZ3IqIr8RImuSXKjZezGMiiDgawgK/3ULp2f254WeTWCZwDIM41vguwEPdwjonjYrry/2LXQqt85a2QzDqKaxyAVVr4VlmMAyKkqxuG3uLt/JFBWdW4b34gRmnBlfw6iazVWBcBKftZLs9wX0I1aewQSWUUlBoMCs7eLLOqZuGZ7hi6KvhmFUyz5kg+IkEX/ntUwc3gPhLivRYALLqNQpSj4C2X29vZeB3j6dX/9biYbOjWdH8VJFsCuH49EfGhS5spUHuJvOMowKmd8gPzzdC2e7aRgmsIwKaYFd4GuJG+wSd0MzF1g2hzsUVxkkvoMq7ncXAkvRa3pFej1kFoNlGJU63BKCqMoaG43zJ7QhMMpGK/JTJOrFxFWnRjPrQ8JJ9O5DrfpHFQJpowbWVyA7AHEA3z2NKuZVNIwq2QkNwU2rTjjnPw3wgF0PmsAyKocAREnXd9bALVi22rIMqKKf3pbXFFuyMFIQgex+hvtAXjSvKkWwu2EYFdFYIRLMqE5vXJj4NMB2C3A/L8wDYJROYDnllT0I1mR0ucynvrNzQzLQBKbMoBhG9SxElIuFgwrOSjSYwDKqvNqFaatut0xjCd4r/e3+/s4zxnbiCodG3goPGkbVRIIG6ELq2CHg91oIgAkso7qI2rxdDjzQhThB2zaYzyuMbRSFvzBM0GuV9Q2jUgewrBcJJ2D/pmZ9r0KwrYNepSawDGOlCyzBWw/CzvVVD8iM6tfSUI5rbgs6GVNvL8QwKimyFNr3cpvAMowyKQOlJwKx66hOBZa4BfGfv25h/Ah5YHq7mUFWWd8wqimuiPPazv9mo7F0LIvQKJUo2AHOIzsnVL+zV2R0Fk3kIs3jKl59OZU1yxC0qsBcFQbHPKNG1df8UtZCBNJUPREk+ju6mHRsmMAyKmnsvIKTZGz/wXjkexx8eq24NePqL0rUZSs3LqlAVAHjGcyiqPg7BbQdYVEY3PRw9+hVkvKjUygKYZl3pBDEXHEG5IFGHhJpf405KXFAuIN0EIka+M+vZ/xIsbYt/soEllFlkbUHwk2txj1fi0e+N1b9qRr8yNwFrOq+eGzrwq0ZEIlOq6/COEoKTIfN/6S1uB8s/TEC/oDM+8uke9MCWuoTvwMydDaFeVtpq93MoCAjl4uLUtqb1IkqUyV2+BSHMC/oB817ZQLLWCUURTGdtBr3AD+nXP+aE9x3wRZ/L7gENIjWvLCp+kSEnxfoqoC18b1Z1N3hRsRAUnuuCF7O6pQykgyJi+qa7phqjd+ZQhRCYqtt9TEFwQBk/V1DT03VPXtcNVNdUqZtLkZEr4uR21u5F6t068IXnzmNmp+SpD0vtyl1wyjvCcsVk/iiupSOxaOTDgbS8laST4Zw0aTqn1ydjP3MfnBb2hATxZVBdiwa/diQyA+Mo2kZD20Kvoa4RPWwT7ofv4Fj5sEyOuZLDA6vj8L/bIqsa+XeXVemNdGDuAXV+5vxwndfOzt7mtzemchaAubBMsp8OvCFMZALqXLOsSjuKOtiz3zpU+aKmgzTAtm+zgy/qmij7Gc1yU/swcPElR1AV+fB7cwdIRDsX+Lvj0JwDdfrsWj8F2ORDdNoKiXbax34CNIF3G9fNzt7cg+EVv/KBJaxOoWWXuDns2hgjoXzL+tDemZKaDT5JuWgtQ42IQH0Qa7sEW2tTeXMvlRawQkcXcyoLOaUndZXpz0516604x1P4D6OMPqTM98wvUojMNVBOImm9ye9HwTYam3JOrErhmE8Gv273RVEnhAjYZnjEQRI888/0YntEMg0XHhSn8izJ1FPeTOmfA00Fd4soHutFYjRvjgJFNzBeOSFfSIDGZqV7eAhkPWKAPqhq4lUIbCrQRNYhnHB7aeiYyXfANRBNEk200r82wA2d+D6TwuxJuUeE2KQUK1atdHRPBKB7OtcH8XIBxN0IMkPImVbHhoh6kU/fSP3NfebTmgbuyI0jPMwnHeBP81ofwueunABS0JcRIIWruPkgEB0tsylGYpiim4GPeWRe/RMOJZhLM1GAO4ABN1RY3cNF86hmSuZN7RI+IgmvD5YS+IPAGyxbNq2MWVqGI+NbIesGbeu7BZ51nQusMp6jZT1i0NV3n4T9dk9eSZgW+7/HeAUt6Xk79b3IG4aveeaZOyLdNYyyFil7M2v0bKe2vC2EXE/NItKGYuMCvgu0JbqG6/k5Oxuuy43gWUYF2WxxDo+i/oyWxwBDUBx2YMCvr8D79Mu8Cr8dNlT7RQIkNEdZg+N9uZPsBWyrzO8flDd/57K23eV87RBfl3unNYB1lomrQksw7jwugSyVvyKXsRpiTNqlLwdjFc30u4zilOtPxKOfEc/cm4+D+QttS1Rz7t2mefKWPp6EvLYK+2P3c4A6WuVM+4KBd+FBNPoicz5zyu4rZY9aALLMC60wFIQUXl6fFanlHEz0BAJplQbzssnADa3YUDXFhtKJnp9L3JZq7wFV8++YMk+Y9PcWOq0uSsXU+lD8eifD+BeNoWmrrzXaloDmYG3X7swcXhRONprNoFlGBfWkoJ6yd3mZT5wR+BmVRsb0voXiu/VttdGRFqtkmcQLgrPTKXPZrmxFPZBuB2yQ/Hwe4fF/eQYPpGSJ44pEGn2cbWrwWXBsggN49ENjgA6weDwAnJtk3IX1MzjjRBdhmBuwTcFJyV/v8QgkW0oxhK4F2o3QvNgtPZJA+hL6+pL2SbqnANk2o+4WWVPmNTuJw/at8rtHWIeLMN4jDUikE2F0bf3474rptwFNRfLk/d3Iq5On7k2cNeXPGgp60fctPp/ilP3JS1iy2zKG4+xhlwurgaf1CP+n1topiWNu1okLQqktlxyx5WcnMWuBk1gGcZFM6qSjTXRsl+HaQzq4V1wJlh9yWyHTMEF6n5lvsR2RPIK7pLi5tZSn8ZiToxHF1ZnPL/HozVv6ZXwkw4ZbhY1sEr81dJhnEyr33tNc/Ize3JPnB00lgG7IjSM89qM5cfLHsitoL0gE6L/CTCebwpZe+OBP4zO1ko8JArBHIpH/4+e6e9rGN8srCjqXAH+wXjkL0eRl5xCyVDvSu6oEJAUP4+6nQKptcZZPsyDZRjnYWBF5LllF1cxuGn0OOoOKcgr2xBXWtiMQ9Gap/SIjCb5SLetKssuAKat9d9ZczfrQewuxAZAugeDo0fi8aO/6+JFu77Ds2pBpGoKrWdIxMGvN0wjEMrIYpNdLkJ6p7HSTFITEe/eZfN9uXlIXzAB6cBBaayFpQQHTRnmhNIjbO5TklxAhz6GI+HuGv0Cq7pMexMnVi6xB1EWQS5bS0oVlFSzDGCuR7PrSQJZKn5Mzp1UqYKLX/WILrONoPqJIRhQQsyRpw8A8bmTwF0MIxoIxIEtPiJrqm+OFdmMMkTk+N3jEDjWAi2HgMGpBoNaqiZJAf1t/p1lsJLqW/JnX6FhWWjuEpqF0HqkrOCgTJ9SuJST3dP0jUeFCAlLTuNrXvRiGcWdkFcJdLmCbBJXpJtm9X7Iub+rMFqdMn6PEV6H4jFoLNiJMAhP1G3bJNkasazlVGJAWJUSAarU+B4IyFR4h1Wr9Bm4pFm3iuvTMxcVWiE3aH3LF8u6rVkj9gPsT5F0Ye/0EJ7yoFEFaRnBnTq+kITKtLEjXaIMCZ+V4h/L5T2YxeSYcxAUXdCHe/XNiGHhxIpjBlGT/Z9FmAZFISB0RpQINd6+/r2ioJiNvGSVkp/FBXRFHVjQCxF5Zb4hX5E/BxlFZ9q/KIZN4X1U5XWBR+jaME0eqhBJKIL3m1gbEV5VJlbW3FLT6fqocOiqkfqFkPoTR5iXq5W7I3EarfhNSqKqmpP7I9LNHpGa3IcXF/FU7bBYOqF3h07L9bCSqlHsCioOxHdmKHpV+Yp9NVq7lRXxEn5SdM7hSECTifg4CxLHfkPa4yIJaL27bCbZf9OAqQWJUOHNEzinbBMI3AIRWLRxEYXaX6IJ3YwViFdQpvLHZi3S1q13O1bqrBRFWTFpAKVhA6tNKbODnW76lfGU4uNM4zKEigjNgomsIzqIQIaKIMxsjZ9jObOxnkLVwSNO0m5ngbdAU68v8IX17g2soZRLfuboqmKnF5c8zYk33RYNYxy45HUMgiXXWTNFlmA7fyuCKT3MzyIyC9N5YXnrUOOYVTHPvguJBz3enBD0vhzaL9eXpUxD5ZR/mMU6sxztazGU/F+R6fPOcL4rCKZvRjDqKrtNUxgGZUmlaBpo7Bs4ooIxCFJp3Z3Uzj8HV0QecvsNIwqmwzDBJZR2Uks+lobhWUhG0DctPp/mkjDL2t+rdd2BmEowU/047ozsAxCw6ggArGNggkso9pcb0OwPKfRCCQTOX0Lp2c4UwKjrWOtgM5lmLIyjIqKK1R46Jz/NExgGRVc6PM2CsuksABRok6z/gphNm8GxjAqie8CTeF3oP12WiawDGNlCwKxJsLLrlh9J56rB8AfZHAIeMZc/hh7P4ZRsYNYDCKa9dpomMAyKoiALhB6QS/3heiyUWlbXPkICRveHw8C+SDA5g7q2+wCb70hDaO6h7FuxEWaWYC7CSyjqlxGc1ggVasU3jEBSAIL6+cbxxYF7FKfsbvoDXk4Gr55EG6as96QhlE1cZX1IyyofmyqWTtR9IM1+2sCy6gK+4sSDS6SXx4i6PdWyX25SDrxBN6eZ3IqIr8RImuSXKjZezGMiiDgawgK/3ULp2f254WeTWCZwDIM41vguwEPdwjonjYrry/2LXQqt85a2QzDqKaxyAVVr4VlmMAyKkqxuG3uLt/JFBWdW4b34gRmnBlfw6iazVWBcBKftZLs9wX0I1aewQSWUUlBoMCs7eLLOqZuGZ7hi6KvhmFUyz5kg+IkEX/ntUwc3gPhLivRYALLqNQpSj4C2X29vZeB3j6dX/9biYbOjWdH8VJFsCuH49EfGhS5spUHuJvOMowKmd8gPzzdC2e7aRgmsIwKaYFd4GuJG+wSd0MzF1g2hzsUVxkkvoMq7ncXAkvRa3pFej1kFoNlGJU63BKCqMoaG43zJ7QhMMpGK/JTJOrFxFWnRjPrQ8JJ9O5DrfpHFQJpowbWVyA7AHEA3z2NKuZVNIwq2QkNwU2rTjjnPw3wgF0PmsAyKocAREnXd9bALVi22rIMqKKf3pbXFFuyMFIQgex+hvtAXjSvKkWwu2EYFdFYIRLMqE5vXJj4NMB2C3A/L8wDYJROYDnllT0I1mR0ucynvrNzQzLQBKbMoBhG9SxElIuFgwrOSjSYwDKqvNqFaatut0xjCd4r/e3+/s4zxnbiCodG3goPGkbVRIIG6ELq2CHg91oIgAkso7qI2rxdDjzQhThB2zaYzyuMbRSFvzBM0GuV9Q2jUgewrBcJJ2D/pmZ9r0KwrYNepSawDGOlCyzBWw/CzvVVD8iM6tfSUI5rbgs6GVNvL8QwKimyFNr3cpvAMowyKQOlJwKx66hOBZa4BfGfv25h/Ah5YHq7mUFWWd8wqimuiPPazv9mo7F0LIvQKJUo2AHOIzsnVL+zV2R0Fk3kIs3jKl59OZU1yxC0qsBcFQbHPKNG1df8UtZCBNJUPREk+ju6mHRsmMAyKmnsvIKTZGz/wXjkexx8eq24NePqL0rUZSs3LqlAVAHjGcyiqPg7BbQdYVEY3PRw9+hVkvKjUygKYZl3pBDEXHEG5IFGHhJpf405KXFAuIN0EIka+M+vZ/xIsbYt/soEllFlkbUHwk2txj1fi0e+N1b9qRr8yNwFrOq+eGzrwq0ZEIlOq6/COEoKTIfN/6S1uB8s/TEC/oDM+8uke9MCWuoTvwMydDaFeVtpq93MoCAjl4uLUtqb1IkqUyV2+BSHMC/oB817ZQLLWCUURTGdtBr3AD+nXP+aE9x3wRZ/L7gENIjWvLCp+kSEnxfoqoC18b1Z1N3hRsRAUnuuCF7O6pQykgyJi+qa7phqjd+ZQhRCYqtt9TEFwQBk/V1DT03VPXtcNVNdUqZtLkZEr4uR21u5F6t068IXnzmNmp+SpD0vtyl1wyjvCcsVk/iiupSOxaOTDgbS8laST4Zw0aTqn1ydjP3MfnBb2hATxZVBdiwa/diQyA+Mo2kZD20Kvoa4RPWwT7ofv4Fj5sEyOuZLDA6vj8L/bIqsa+XeXVemNdGDuAXV+5vxwndfOzt7mtzemchaAubBMsp8OvCFMZALqXLOsSjuKOtiz3zpU+aKmgzTAtm+zgy/qmij7Gc1yU/swcPElR1AV+fB7cwdIRDsX+Lvj0JwDdfrsWj8F2ORDdNoKiXbax34CNIF3G9fNzt7cg+EVv/KBJaxOoWWXuDns2hgjoXzL+tDemZKaDT5JuWgtQ42IQH0Qa7sEW2tTeXMvlRawQkcXcyoLOaUndZXpz0516604x1P4D6OMPqTM98wvUojMNVBOImm9ye9HwTYam3JOrErhmE8Gv273RVEnhAjYZnjEQRI888/0YntEMg0XHhSn8izJ1FPeTOmfA00Fd4soHutFYjRvjgJFNzBeOSFfSIDGZqV7eAhkPWKAPqhq4lUIbCrQRNYhnHB7aeiYyXfANRBNEk200r82wA2d+D6TwuxJuUeE2KQUK1atdHRPBKB7OtcH8XIBxN0IMkPImVbHhoh6kU/fSP3NfebTmgbuyI0jPMwnHeBP81ofwueunABS0JcRIIWruPkgEB0tsylGYpiim4GPeWRe/RMOJZhLM1GAO4ABN1RY3cNF86hmSuZN7RI+IgmvD5YS+IPAGyxbNq2MWVqGI+NbIesGbeu7BZ51nQusMp6jZT1i0NV3n4T9dk9eSZgW+7/HeAUt6Xk79b3IG4aveeaZOyLdNYyyFil7M2v0bKe2vC2EXE/NItKGYuMCvgu0JbqG6/k5Oxuuy43gWUYF2WxxDo+i/oyWxwBDUBx2YMCvr8D79Mu8Cr8dNlT7RQIkNEdZg+N9uZPsBWyrzO8flDd/57K23eV87RBfl3unNYB1lomrQksw7jwugSyVvyKXsRpiTNqlLwdjFc30u4zilOtPxKOfEc/cm4+D+QttS1Rz7t2mefKWPp6EvLYK+2P3c4A6WuVM+4KBd+FBNPoicz5zyu4rZY9aALLMC60wFIQUXl6fFanlHEz0BAJplQbzssnADa3YUDXFhtKJnp9L3JZq7wFV8++YMk+Y9PcWOq0uSsXU+lD8eifD+BeNoWmrrzXaloDmYG3X7swcXhRONprNoFlGBfWkoJ6yd3mZT5wR+BmVRsb0voXiu/VttdGRFqtkmcQLgrPTKXPZrmxFPZBuB2yQ/Hwe4fF/eQYPpGSJ44pEGn2cbWrwWXBsggN49ENjgA6weDwAnJtk3IX1MzjjRBdhmBuwTcFJyV/v8QgkW0oxhK4F2o3QvNgtPZJA+hL6+pL2SbqnANk2o+4WWVPmNTuJw/at8rtHWIeLMN4jDUikE2F0bf3474rptwFNRfLk/d3Iq5On7k2cNeXPGgp60fctPp/ilP3JS1iy2zKG4+xhlwurgaf1CP+n1topiWNu1okLQqktlxyx5WcnMWuBk1gGcZFM6qSjTXRsl+HaQzq4V1wJlh9yWyHTMEF6n5lvsR2RPIK7pLi5tZSn8ZiToxHF1ZnPL/HozVv6ZXwkw4ZbhY1sEr81dJhnEyr33tNc/Ize3JPnB00lgG7IjSM89qM5cfLHsitoL0gE6L/CTCebwpZe+OBP4zO1ko8JArBHIpH/4+e6e9rGN8srCjqXAH+wXjkL0eRl5xCyVDvSu6oEJAUP4+6nQKptcZZPsyDZRjnYWBF5LllF1cxuGn0OOoOKcgr2xBXWtiMQ9Gap/SIjCb5SLetKssuAKat9d9ZczfrQewuxAZAugeDo0fi8aO/6+JFu77Ds2pBpGoKrWdIxMGvN0wjEMrIYpNdLkJ6p7HSTFITEe/eZfN9uXlIXzAB6cBBaayFpQQHTRnmhNIjbO5TklxAhz6GI+HuGv0Cq7pMexMnVi6xB1EWQS5bS0oVlFSzDGCuR7PrSQJZKn5Mzp1UqYKLX/WILrONoPqJIRhQQsyRpw8A8bmTwF0MIxoIxIEtPiJrqm+OFdmMMkTk+N3jEDjWAi2HgMGpBoNaqiZJAf1t/p1lsJLqW/JnX6FhWWjuEpqF0HqkrOCgTJ9SuJST3dP0jUeFCAlLTuNrXvRiGcWdkFcJdLmCbBJXpJtm9X7Iub+rMFqdMn6PEV6H4jFoLNiJMAhP1G3bJNkasazlVGJAWJUSAarU+B4IyFR4h1Wr9Bm4pFm3iuvTMxcVWiE3aH3LF8u6rVkj9gPsT5F0Ye/0EJ7yoFEFaRnBnTq+kITKtLEjXaIMCZ+V4h/L5T2YxeSYcxAUXdCHe/XNiGHhxIpjBlGT/Z9FmAZFISB0RpQINd6+/r2ioJiNvGSVkp/FBXRFHVjQCxF5Zb4hX5E/BxlFZ9q/KIZN4X1U5XWBR+jaME0eqhBJKIL3m1gbEV5VJlbW3FLT6fqocOiqkfqFkPoTR5iXq5W7I3EarfhNSqKqmpP7I9LNHpGa3IcXF/FU7bBYOqF3h07L9bCSqlHsCioOxHdmKHpV+Yp9NVq7lRXxEn5SdM7hSECTifg4CxLHfkPa4yIJaL27bCbZf9OAqQWJUOHNEzinbBMI3AIRWLRxEYXaX6IJ3YwViFdQpvLHZi3S1q13O1bqrBRFWTFpAKVhA6tNKbODnW76lfGU4uNM4zKEigjNgomsIzqIQIaKIMxsjZ9jObOxnkLVwSNO0m5ngbdAU68v8IX17g2soZRLfuboqmKnF5c8zYk33RYNYxy45HUMgiXXWTNFlmA7fyuCKT3MzyIyC9N5YXnrUOOYVTHPvguJBz3enBD0vhzaL9eXpUxD5ZR/mMU6sxztazGU/F+R6fPOcL4rCKZvRjDqKrtNUxgGZUmlaBpo7Bs4ooIxCFJp3Z3Uzj8HV0QecvsNIwqmwzDBJZR2Uks+lobhWUhG0DctPp/mkjDL2t+rdd2BmEowU/047ozsAxCw6ggArGNggkso9pcb0OwPKfRCCQTOX0Lp2c4UwKjrWOtgM5lmLIyjIqKK1R46Jz/NExgGRVc6PM2CsuksABRok6z/gphNm8GxjAqie8CTeF3oP12WiawDGNlCwKxJsLLrlh9J56rB8AfZHAIeMZc/hh7P4ZRsYNYDCKa9dpomMAyKoiALhB6QS/3heiyUWlbXPkICRveHw8C+SDA5g7q2+wCb70hDaO6h7FuxEWaWYC7CSyjqlxGc1ggVasU3jEBSAIL6+cbxxYF7FKfsbvoDXk4Gr55EG6as96QhlE1cZX1IyyofmyqWTtR9IM1+2sCy6gK+4sSDS6SXx4i6PdWyX25SDrxBN6eZ3IqIr8RImuSXKjZezGMiiDgawgK/3ULp2f254WeTWCZwDIM41vguwEPdwjonjYrry/2LXQqt85a2QzDqKaxyAVVr4VlmMAyKkqxuG3uLt/JFBWdW4b34gRmnBlfw6iazVWBcBKftZLs9wX0I1aewQSWUUlBoMCs7eLLOqZuGZ7hi6KvhmFUyz5kg+IkEX/ntUwc3gPhLivRYALLqNQpSj4C2X29vZeB3j6dX/9biYbOjWdH8VJFsCuH49EfGhS5spUHuJvOMowKmd8gPzzdC2e7aRgmsIwKaYFd4GuJG+wSd0MzF1g2hzsUVxkkvoMq7ncXAkvRa3pFej1kFoNlGJU63BKCqMoaG43zJ7QhMMpGK/JTJOrFxFWnRjPrQ8JJ9O5DrfpHFQJpowbWVyA7AHEA3z2NKuZVNIwq2QkNwU2rTjjnPw3wgF0PmsAyKocAREnXd9bALVi22rIMqKKf3pbXFFuyMFIQgex+hvtAXjSvKkWwu2EYFdFYIRLMqE5vXJj4NMB2C3A/L8wDYJROYDnllT0I1mR0ucynvrNzQzLQBKbMoBhG9SxElIuFgwrOSjSYwDKqvNqFaatut0xjCd4r/e3+/s4zxnbiCodG3goPGkbVRIIG6ELq2CHg91oIgAkso7qI2rxdDjzQhThB2zaYzyuMbRSFvzBM0GuV9Q2jUgewrBcJJ2D/pmZ9r0KwrYNepSawDGOlCyzBWw/CzvVVD8iM6tfSUI5rbgs6GVNvL8QwKimyFNr3cpvAMowyKQOlJwKx66hOBZa4BfGfv25h/Ah5YHq7mUFWWd8wqimuiPPazv9mo7F0LIvQKJUo2AHOIzsnVL+zV2R0Fk3kIs3jKl59OZU1yxC0qsBcFQbHPKNG1df8UtZCBNJUPREk+ju6mHRsmMAyKmnsvIKTZGz/wXjkexx8eq24NePqL0rUZSs3LqlAVAHjGcyiqPg7BbQdYVEY3PRw9+hVkvKjUygKYZl3pBDEXHEG5IFGHhJpf405KXFAuIN0EIka+M+vZ/xIsbYt/soEllFlkbUHwk2txj1fi0e+N1b9qRr8yNwFrOq+eGzrwq0ZEIlOq6/COEoKTIfN/6S1uB8s/TEC/oDM+8uke9MCWuoTvwMydDaFeVtpq93MoCAjl4uLUtqb1IkqUyV2+BSHMC/oB817ZQLLWCUURTGdtBr3AD+nXP+aE9x3wRZ/L7gENIjWvLCp+kSEnxfoqoC18b1Z1N3hRsRAUnuuCF7O6pQykgyJi+qa7phqjd+ZQhRCYqtt9TEFwQBk/V1DT03VPXtcNVNdUqZtLkZEr4uR21u5F6t068IXnzmNmp+SpD0vtyl1wyjvCcsVk/iiupSOxaOTDgbS8laST4Zw0aTqn1ydjP3MfnBb2hATxZVBdiwa/diQyA+Mo2kZD20Kvoa4RPWwT7ofv4Fj5sEyOuZLDA6vj8L/bIqsa+XeXVemNdGDuAXV+5vxwndfOzt7mtzemchaAubBMsp8OvCFMZALqXLOsSjuKOtiz3zpU+aKmgzTAtm+zgy/qmij7Gc1yU/swcPElR1AV+fB7cwdIRDsX+Lvj0JwDdfrsWj8F2ORDdNoKiXbax34CNIF3G9fNzt7cg+EVv/KBJaxOoWWXuDns2hgjoXzL+tDemZKaDT5JuWgtQ42IQH0Qa7sEW2tTeXMvlRawQkcXcyoLOaUndZXpz0516604x1P4D6OMPqTM98wvUojMNVBOImm9ye9HwTYam3JOrErhmE8Gv273RVEnhAjYZnjEQRI888/0YntEMg0XHhSn8izJ1FPeTOmfA00Fd4soHutFYjRvjgJFNzBeOSFfSIDGZqV7eAhkPWKAPqhq4lUIbCrQRNYhnHB7aeiYyXfANRBNEk200r82wA2d+D6TwuxJuUeE2KQUK1atdHRPBKB7OtcH8XIBxN0IMkPImVbHhoh6kU/fSP3NfebTmgbuyI0jPMwnHeBP81ofwueunABS0JcRIIWruPkgEB0tsylGYpiim4GPeWRe/RMOJZhLM1GAO4ABN1RY3cNF86hmSuZN7RI+IgmvD5YS+IPAGyxbNq2MWVqGI+NbIesGbeu7BZ51nQusMp6jZT1i0NV3n4T9dk9eSZgW+7/HeAUt6Xk79b3IG4aveeaZOyLdNYyyFil7M2v0bKe2vC2EXE/NItKGYuMCvgu0JbqG6/k5Oxuuy43gWUYF2WxxDo+i/oyWxwBDUBx2YMCvr8D79Mu8Cr8dNlT7RQIkNEdZg+N9uZPsBWyrzO8flDd/57K23eV87RBfl3unNYB1lomrQksw7jwugSyVvyKXsRpiTNqlLwdjFc30u4zilOtPxKOfEc/cm4+D+QttS1Rz7t2mefKWPp6EvLYK+2P3c4A6WuVM+4KBd+FBNPoicz5zyu4rZY9aALLMC60wFIQUXl6fFanlHEz0BAJplQbzssnADa3YUDXFhtKJnp9L3JZq7wFV8++YMk+Y9PcWOq0uSsXU+lD8eifD+BeNoWmrrzXaloDmYG3X7swcXhRONprNoFlGBfWkoJ6yd3mZT5wR+BmVRsb0voXiu/VttdGRFqtkmcQLgrPTKXPZrmxFPZBuB2yQ/Hwe4fF/eQYPpGSJ44pEGn2cbWrwWXBsggN49ENjgA6weDwAnJtk3IX1MzjjRBdhmBuwTcFJyV/v8QgkW0oxhK4F2o3QvNgtPZJA+hL6+pL2SbqnANk2o+4WWVPmNTuJw/at8rtHWIeLMN4jDUikE2F0bf3474rptwFNRfLk/d3Iq5On7k2cNeXPGgp60fctPp/ilP3JS1iy2zKG4+xhlwurgaf1CP+n1topiWNu1okLQqktlxyx5WcnMWuBk1gGcZFM6qSjTXRsl+HaQzq4V1wJlh9yWyHTMEF6n5lvsR2RPIK7pLi5tZSn8ZiToxHF1ZnPL/HozVv6ZXwkw4ZbhY1sEr81dJhnEyr33tNc/Ize3JPnB00lgG7IjSM89qM5cfLHsitoL0gE6L/CTCebwpZe+OBP4zO1ko8JArBHIpH/4+e6e9rGN8srCjqXAH+wXjkL0eRl5xCyVDvSu6oEJAUP4+6nQKptcZZPsyDZRjnYWBF5LllF1cxuGn0OOoOKcgr2xBXWtiMQ9Gap/SIjCb5SLetKssuAKat9d9ZczfrQewuxAZAugeDo0fi8aO/6+JFu77Ds2pBpGoKrWdIxMGvN0wjEMrIYpNdLkJ6p7HSTFITEe/eZfN9uXlIXzAB6cBBaayFpQQHTRnmhNIjbO5TklxAhz6GI+HuGv0Cq7pMexMnVi6xB1EWQS5bS0oVlFSzDGCuR7PrSQJZKn5Mzp1UqYKLX/WILrONoPqJIRhQQsyRpw8A8bmTwF0MIxoIxIEtPiJrqm+OFdmMMkTk+N3jEDjWAi2HgMGpBoNaqiZJAf1t/p1lsJLqW/JnX6FhWWjuEpqF0HqkrOCgTJ9SuJST3dP0jUeFCAlLTuNrXvRiGcWdkFcJdLmCbBJXpJtm9X7Iub+rMFqdMn6PEV6H4jFoLNiJMAhP1G3bJNkasazlVGJAWJUSAarU+B4IyFR4h1Wr9Bm4pFm3iuvTMxcVWiE3aH3LF8u6rVkj9gPsT5F0Ye/0EJ7yoFEFaRnBnTq+kITKtLEjXaIMCZ+V4h/L5T2YxeSYcxAUXdCHe/XNiGHhxIpjBlGT/Z9FmAZFISB0RpQINd6+/r2ioJiNvGSVkp/FBXRFHVjQCxF5Zb4hX5E/BxlFZ9q/KIZN4X1U5XWBR+jaME0eqhBJKIL3m1gbEV5VJlbW3FLT6fqocOiqkfqFkPoTR5iXq5W7I3EarfhNSqKqmpP7I9LNHpGa3IcXF/FU7bBYOqF3h07L9bCSqlHsCioOxHdmKHpV+Yp9NVq7lRXxEn5SdM7hSECTifg4CxLHfkPa4yIJaL27bCbZf9OAqQWJUOHNEzinbBMI3AIRWLRxEYXaX6IJ3YwViFdQpvLHZi3S1q13O1bqrBRFWTFpAKVhA6tNKbODnW76lfGU4uNM4zKEigjNgomsIzqIQIaKIMxsjZ9jObOxnkLVwSNO0m5ngbdAU68v8IX17g2soZRLfuboqmKnF5c8zYk33RYNYxy45HUMgiXXWTNFlmA7fyuCKT3MzyIyC9N5YXnrUOOYVTHPvguJBz3enBD0vhzaL9eXpUxD5ZR/mMU6sxztazGU/F+R6fPOcL4rCKZvRjDqKrtNUxgGZUmlaBpo7Bs4ooIxCFJp3Z3Uzj8HV0QecvsNIwqmwzDBJZR2Uks+lobhWUhG0DctPp/mkjDL2t+rdd2BmEowU/047ozsAxCw6ggArGNggkso9pcb0OwPKfRCCQTOX0Lp2c4UwKjrWOtgM5lmLIyjIqKK1R46Jz/NExgGRVc6PM2CsuksABRok6z/gphNm8GxjAqie8CTeF3oP12WiawDGNlCwKxJsLLrlh9J56rB8AfZHAIeMZc/hh7P4ZRsYNYDCKa9dpomMAyKoiALhB6QS/3heiyUWlbXPkICRveHw8C+SDA5g7q2+wCb70hDaO6h7FuxEWaWYC7CSyjqlxGc1ggVasU3jEBSAIL6+cbxxYF7FKfsbvoDXk4Gr55EG6as96QhlE1cZX1IyyofmyqWTtR9IM1+2sCy6gK+4sSDS6SXx4i6PdWyX25SDrxBN6eZ3IqIr8RImuSXKjZezGMiiDgawgK/3ULp2f254WeTWCZwDIM41vguwEPdwjonjYrry/2LXQqt85a2QzDqKaxyAVVr4VlmMAyKkqxuG3uLt/JFBWdW4b34gRmnBlfw6iazVWBcBKftZLs9wX0I1aewQSWUUlBoMCs7eLLOqZuGZ7hi6KvhmFUyz5kg+IkEX/ntUwc3gPhLivRYALLqNQpSj4C2X29vZeB3j6dX/9biYbOjWdH8VJFsCuH49EfGhS5spUHuJvOMowKmd8gPzzdC2e7aRgmsIwKaYFd4GuJG+wSd0MzF1g2hzsUVxkkvoMq7ncXAkvRa3pFej1kFoNlGJU63BKCqMoaG43zJ7QhMMpGK/JTJOrFxFWnRjPrQ8JJ9O5DrfpHFQJpowbWVyA7AHEA3z2NKuZVNIwq2QkNwU2rTjjnPw3wgF0PmsAyKocAREnXd9bALVi22rIMqKKf3pbXFFuyMFIQgex+hvtAXjSvKkWwu2EYFdFYIRLMqE5vXJj4NMB2C3A/L8wDYJROYDnllT0I1mR0ucynvrNzQzLQBKbMoBhG9SxElIuFgwrOSjSYwDKqvNqFaatut0xjCd4r/e3+/s4zxnbiCodG3goPGkbVRIIG6ELq2CHg91oIgAkso7qI2rxdDjzQhThB2zaYzyuMbRSFvzBM0GuV9Q2jUgewrBcJJ2D/pmZ9r0KwrYNepSawDGOlCyzBWw/CzvVVD8iM6tfSUI5rbgs6GVNvL8QwKimyFNr3cpvAMowyKQOlJwKx66hOBZa4BfGfv25h/Ah5YHq7mUFWWd8wqimuiPPazv9mo7F0LIvQKJUo2AHOIzsnVL+zV2R0Fk3kIs3jKl59OZU1yxC0qsBcFQbHPKNG1df8UtZCBNJUPREk+ju6mHRsmMAyKmnsvIKTZGz/wXjkexx8eq24NePqL0rUZSs3LqlAVAHjGcyiqPg7BbQdYVEY3PRw9+hVkvKjUygKYZl3pBDEXHEG5IFGHhJpf405KXFAuIN0EIka+M+vZ/xIsbYt/soEllFlkbUHwk2txj1fi0e+N1b9qRr8yNwFrOq+eGzrwq0ZEIlOq6/COEoKTIfN/6S1uB8s/TEC/oDM+8uke9MCWuoTvwMydDaFeVtpq93MoCAjl4uLUtqb1IkqUyV2+BSHMC/oB817ZQLLWCUURTGdtBr3AD+nXP+aE9x3wRZ/L7gENIjWvLCp+kSEnxfoqoC18b1Z1N3hRsRAUnuuCF7O6pQykgyJi+qa7phqjd+ZQhRCYqtt9TEFwQBk/V1DT03VPXtcNVNdUqZtLkZEr4uR21u5F6t068IXnzmNmp+SpD0vtyl1wyjvCcsVk/iiupSOxaOTDgbS8laST4Zw0aTqn1ydjP3MfnBb2hATxZVBdiwa/diQyA+Mo2kZD20Kvoa4RPWwT7ofv4Fj5sEyOuZLDA6vj8L/bIqsa+XeXVemNdGDuAXV+5vxwndfOzt7mtzemchaAubBMsp8OvCFMZALqXLOsSjuKOtiz3zpU+aKmgzTAtm+zgy/qmij7Gc1yU/swcPElR1AV+fB7cwdIRDsX+Lvj0JwDdfrsWj8F2ORDdNoKiXbax34CNIF3G9fNzt7cg+EVv/KBJaxOoWWXuDns2hgjoXzL+tDemZKaDT5JuWgtQ42IQH0Qa7sEW2tTeXMvlRawQkcXcyoLOaUndZXpz0516604x1P4D6OMPqTM98wvUojMNVBOImm9ye9HwTYam3JOrErhmE8Gv273RVEnhAjYZnjEQRI888/0YntEMg0XHhSn8izJ1FPeTOmfA00Fd4soHutFYjRvjgJFNzBeOSFfSIDGZqV7eAhkPWKAPqhq4lUIbCrQRNYhnHB7aeiYyXfANRBNEk200r82wA2d+D6TwuxJuUeE2KQUK1atdHRPBKB7OtcH8XIBxN0IMkPImVbHhoh6kU/fSP3NfebTmgbuyI0jPMwnHeBP81ofwueunABS0JcRIIWruPkgEB0tsylGYpiim4GPeWRe/RMOJZhLM1GAO4ABN1RY3cNF86hmSuZN7RI+IgmvD5YS+IPAGyxbNq2MWVqGI+NbIesGbeu7BZ51nQusMp6jZT1i0NV3n4T9dk9eSZgW+7/HeAUt6Xk79b3IG4aveeaZOyLdNYyyFil7M2v0bKe2vC2EXE/NItKGYuMCvgu0JbqG6/k5Oxuuy43gWUYF2WxxDo+i/oyWxwBDUBx2YMCvr8D79Mu8Cr8dNlT7RQIkNEdZg+N9uZPsBWyrzO8flDd/57K23eV87RBfl3unNYB1lomrQksw7jwugSyVvyKXsRpiTNqlLwdjFc30u4zilOtPxKOfEc/cm4+D+QttS1Rz7t2mefKWPp6EvLYK+2P3c4A6WuVM+4KBd+FBNPoicz5zyu4rZY9aALLMC60wFIQUXl6fFanlHEz0BAJplQbzssnADa3YUDXFhtKJnp9L3JZq7wFV8++YMk+Y9PcWOq0uSsXU+lD8eifD+BeNoWmrrzXaloDmYG3X7swcXhRONprNoFlGBfWkoJ6yd3mZT5wR+BmVRsb0voXiu/VttdGRFqtkmcQLgrPTKXPZrmxFPZBuB2yQ/Hwe4fF/eQYPpGSJ44pEGn2cbWrwWXBsggN49ENjgA6weDwAnJtk3IX1MzjjRBdhmBuwTcFJyV/v8QgkW0oxhK4F2o3QvNgtPZJA+hL6+pL2SbqnANk2o+4WWVPmNTuJw/at8rtHWIeLMN4jDUikE2F0bf3474rptwFNRfLk/d3Iq5On7k2cNeXPGgp60fctPp/ilP3JS1iy2zKG4+xhlwurgaf1CP+n1topiWNu1okLQqktlxyx5WcnMWuBk1gGcZFM6qSjTXRsl+HaQzq4V1wJlh9yWyHTMEF6n5lvsR2RPIK7pLi5tZSn8ZiToxHF1ZnPL/HozVv6ZXwkw4ZbhY1sEr81dJhnEyr33tNc/Ize3JPnB00lgG7IjSM89qM5cfLHsitoL0gE6L/CTCebwpZe+OBP4zO1ko8JArBHIpH/4+e6e9rGN8srCjqXAH+wXjkL0eRl5xCyVDvSu6oEJAUP4+6nQKptcZZPsyDZRjnYWBF5LllF1cxuGn0OOoOKcgr2xBXWtiMQ9Gap/SIjCb5SLetKssuAKat9d9ZczfrQewuxAZAugeDo0fi8aO/6+JFu77Ds2pBpGoKrWdIxMGvN0wjEMrIYpNdLkJ6p7HSTFITEe/eZfN9uXlIXzAB6cBBaayFpQQHTRnmhNIjbO5TklxAhz6GI+HuGv0Cq7pMexMnVi6xB1EWQS5bS0oVlFSzDGCuR7PrSQJZKn5Mzp1UqYKLX/WILrONoPqJIRhQQsyRpw8A8bmTwF0MIxoIxIEtPiJrqm+OFdmMMkTk+N3jEDjWAi2HgMGpBoNaqiZJAf1t/p1lsJLqW/JnX6FhWWjuEpqF0HqkrOCgTJ9SuJST3dP0jUeFCAlLTuNrXvRiGcWdkFcJdLmCbBJXpJtm9X7Iub+rMFqdMn6PEV6H4jFoLNiJMAhP1G3bJNkasazlVGJAWJUSAarU+B4IyFR4h1Wr9Bm4pFm3iuvTMxcVWiE3aH3LF8u6rVkj9gPsT5F0Ye/0EJ7yoFEFaRnBnTq+kITKtLEjXaIMCZ+V4h/L5T2YxeSYcxAUXdCHe/XNiGHhxIpjBlGT/Z9FmAZFISB0RpQINd6+/r2ioJiNvGSVkp/FBXRFHVjQCxF5Zb4hX5E/BxlFZ9q/KIZN4X1U5XWBR+jaME0eqhBJKIL3m1gbEV5VJlbW3FLT6fqocOiqkfqFkPoTR5iXq5W7I3EarfhNSqKqmpP7I9LNHpGa3IcXF/FU7bBYOqF3h07L9bCSqlHsCioOxHdmKHpV+Yp9NVq7lRXxEn5SdM7hSECTifg4CxLHfkPa4yIJaL27bCbZf9OAqQWJUOHNEzinbBMI3AIRWLRxEYXaX6IJ3YwViFdQpvLHZi3S1q13O1bqrBRFWTFpAKVhA6tNKbODnW76lfGU4uNM4zKEigjNgomsIzqIQIaKIMxsjZ9jObOxnkLVwSNO0m5ngbdAU68v8IX17g2soZRLfuboqmKnF5c8zYk33RYNYxy45HUMgiXXWTNFlmA7fyuCKT3MzyIyC9N5YXnrUOOYVTHPvguJBz3enBD0vhzaL9eXpUxD5ZR/mMU6sxztazGU/F+R6fPOcL4rCKZvRjDqKrtNUxgGZUmlaBpo7Bs4ooIxCFJp3Z3Uzj8HV0QecvsNIwqmwzDBJZR2Uks+lobhWUhG0DctPp/mkjDL2t+rdd2BmEowU/047ozsAxCw6ggArGNggkso9pcb0OwPKfRCCQTOX0Lp2c4UwKjrWOtgM5lmLIyjIqKK1R46Jz/NExgGRVc6PM2CsuksABRok6z/gphNm8GxjAqie8CTeF3oP12WiawDGNlCwKxJsLLrlh9J56rB8AfZHAIeMZc/hh7P4ZRsYNYDCKa9dpomMAyKoiALhB6QS/3heiyUWlbXPkICRveHw8C+SDA5g7q2+wCb70hDaO6h7FuxEWaWYC7CSyjqlxGc1ggVasU3jEBSAIL6+cbxxYF7FKfsbvoDXk4Gr55EG6as96QhlE1cZX1IyyofmyqWTtR9IM1+2sCy6gK+4sSDS6SXx4i6PdWyX25SDrxBN6eZ3IqIr8RImuSXKjZezGMiiDgawgK/3ULp2f254WeTWCZwDIM41vguwEPdwjonjYrry/2LXQqt85a2QzDqKaxyAVVr4VlmMAyKkqxuG3uLt/JFBWdW4b34gRmnBlfw6iazVWBcBKftZLs9wX0I1aewQSWUUlBoMCs7eLLOqZuGZ7hi6KvhmFUyz5kg+IkEX/ntUwc3gPhLivRYALLqNQpSj4C2X29vZeB3j6dX/9biYbOjWdH8VJFsCuH49EfGhS5spUHuJvOMowKmd8gPzzdC2e7aRgmsIwKaYFd4GuJG+wSd0MzF1g2hzsUVxkkvoMq7ncXAkvRa3pFej1kFoNlGJU63BKCqMoaG43zJ7QhMMpGK/JTJOrFxFWnRjPrQ8JJ9O5DrfpHFQJpowbWVyA7AHEA3z2NKuZVNIwq2QkNwU2rTjjnPw3wgF0PmsAyKocAREnXd9bALVi22rIMqKKf3pbXFFuyMFIQgex+hvtAXjSvKkWwu2EYFdFYIRLMqE5vXJj4NMB2C3A/L8wDYJROYDnllT0I1mR0ucynvrNzQzLQBKbMoBhG9SxElIuFgwrOSjSYwDKqvNqFaatut0xjCd4r/e3+/s4zxnbiCodG3goPGkbVRIIG6ELq2CHg91oIgAkso7qI2rxdDjzQhThB2zaYzyuMbRSFvzBM0GuV9Q2jUgewrBcJJ2D/pmZ9r0KwrYNepSawDGOlCyzBWw/CzvVVD8iM6tfSUI5rbgs6GVNvL8QwKimyFNr3cpvAMowyKQOlJwKx66hOBZa4BfGfv25h/Ah5YHq7mUFWWd8wqimuiPPazv9mo7F0LIvQKJUo2AHOIzsnVL+zV2R0Fk3kIs3jKl59OZU1yxC0qsBcFQbHPKNG1df8UtZCBNJUPREk+ju6mHRsmMAyKmnsvIKTZGz/wXjkexx8eq24NePqL0rUZSs3LqlAVAHjGcyiqPg7BbQdYVEY3PRw9+hVkvKjUygKYZl3pBDEXHEG5IFGHhJpf405KXFAuIN0EIka+M+vZ/xIsbYt/soEllFlkbUHwk2txj1fi0e+N1b9qRr8yNwFrOq+eGzrwq0ZEIlOq6/COEoKTIfN/6S1uB8s/TEC/oDM+8uke9MCWuoTvwMydDaFeVtpq93MoCAjl4uLUtqb1IkqUyV2+BSHMC/oB817ZQLLWCUURTGdtBr3AD+nXP+aE9x3wRZ/L7gENIjWvLCp+kSEnxfoqoC18b1Z1N3hRsRAUnuuCF7O6pQykgyJi+qa7phqjd+ZQhRCYqtt9TEFwQBk/V1DT03VPXtcNVNdUqZtLkZEr4uR21u5F6t068IXnzmNmp+SpD0vtyl1wyjvCcsVk/iiupSOxaOTDgbS8laST4Zw0aTqn1ydjP3MfnBb2hATxZVBdiwa/diQyA+Mo2kZD20Kvoa4RPWwT7ofv4Fj5sEyOuZLDA6vj8L/bIqsa+XeXVemNdGDuAXV+5vxwndfOzt7mtzemchaAubBMsp8OvCFMZALqXLOsSjuKOtiz3zpU+aKmgzTAtm+zgy/qmij7Gc1yU/swcPElR1AV+fB7cwdIRDsX+Lvj0JwDdfrsWj8F2ORDdNoKiXbax34CNIF3G9fNzt7cg+EVv/KBJaxOoWWXuDns2hgjoXzL+tDemZKaDT5JuWgtQ42IQH0Qa7sEW2tTeXMvlRawQkcXcyoLOaUndZXpz0516604x1P4D6OMPqTM98wvUojMNVBOImm9ye9HwTYam3JOrErhmE8Gv273RVEnhAjYZnjEQRI888/0YntEMg0XHhSn8izJ1FPeTOmfA00Fd4soHutFYjRvjgJFNzBeOSFfSIDGZqV7eAhkPWKAPqhq4lUIbCrQRNYhnHB7aeiYyXfANRBNEk200r82wA2d+D6TwuxJuUeE2KQUK1atdHRPBKB7OtcH8XIBxN0IMkPImVbHhoh6kU/fSP3NfebTmgbuyI0jPMwnHeBP81ofwueunABS0JcRIIWruPkgEB0tsylGYpiim4GPeWRe/RMOJZhLM1GAO4ABN1RY3cNF86hmSuZN7RI+IgmvD5YS+IPAGyxbNq2MWVqGI+NbIesGbeu7BZ51nQusMp6jZT1i0NV3n4T9dk9eSZgW+7/HeAUt6Xk79b3IG4aveeaZOyLdNYyyFil7M2v0bKe2vC2EXE/NItKGYuMCvgu0JbqG6/k5Oxuuy43gWUYF2WxxDo+i/oyWxwBDUBx2YMCvr8D79Mu8Cr8dNlT7RQIkNEdZg+N9uZPsBWyrzO8flDd/57K23eV87RBfl3unNYB1lomrQksw7jwugSyVvyKXsRpiTNqlLwdjFc30u4zilOtPxKOfEc/cm4+D+QttS1Rz7t2mefKWPp6EvLYK+2P3c4A6WuVM+4KBd+FBNPoicz5zyu4rZY9aALLMC60wFIQUXl6fFanlHEz0BAJplQbzssnADa3YUDXFhtKJnp9L3JZq7wFV8++YMk+Y9PcWOq0uSsXU+lD8eifD+BeNoWmrrzXaloDmYG3X7swcXhRONprNoFlGBfWkoJ6yd3mZT5wR+BmVRsb0voXiu/VttdGRFqtkmcQLgrPTKXPZrmxFPZBuB2yQ/Hwe4fF/eQYPpGSJ44pEGn2cbWrwWXBsggN49ENjgA6weDwAnJtk3IX1MzjjRBdhmBuwTcFJyV/v8QgkW0oxhK4F2o3QvNgtPZJA+hL6+pL2SbqnANk2o+4WWVPmNTuJw/at8rtHWIeLMN4jDUikE2F0bf3474rptwFNRfLk/d3Iq5On7k2cNeXPGgp60fctPp/ilP3JS1iy2zKG4+xhlwurgaf1CP+n1topiWNu1okLQqktlxyx5WcnMWuBk1gGcZFM6qSjTXRsl+HaQzq4V1wJlh9yWyHTMEF6n5lvsR2RPIK7pLi5tZSn8ZiToxHF1ZnPL/HozVv6ZXwkw4ZbhY1sEr81dJhnEyr33tNc/Ize3JPnB00lgG7IjSM89qM5cfLHsitoL0gE6L/CTCebwpZe+OBP4zO1ko8JArBHIpH/4+e6e9rGN8srCjqXAH+wXjkL0eRl5xCyVDvSu6oEJAUP4+6nQKptcZZPsyDZRjnYWBF5LllF1cxuGn0OOoOKcgr2xBXWtiMQ9Gap/SIjCb5SLetKssuAKat9d9ZczfrQewuxAZAugeDo0fi8aO/6+JFu77Ds2pBpGoKrWdIxMGvN0wjEMrIYpNdLkJ6p7HSTFITEe/eZfN9uXlIXzAB6cBBaayFpQQHTRnmhNIjbO5TklxAhz6GI+HuGv0Cq7pMexMnVi6xB1EWQS5bS0oVlFSzDGCuR7PrSQJZKn5Mzp1UqYKLX/WILrONoPqJIRhQQsyRpw8A8bmTwF0MIxoIxIEtPiJrqm+OFdmMMkTk+N3jEDjWAi2HgMGpBoNaqiZJAf1t/p1lsJLqW/JnX6FhWWjuEpqF0HqkrOCgTJ9SuJST3dP0jUeFCAlLTuNrXvRiGcWdkFcJdLmCbBJXpJtm9X7Iub+rMFqdMn6PEV6H4jFoLNiJMAhP1G3bJNkasazlVGJAWJUSAarU+B4IyFR4h1Wr9Bm4pFm3iuvTMxcVWiE3aH3LF8u6rVkj9gPsT5F0Ye/0EJ7yoFEFaRnBnTq+kITKtLEjXaIMCZ+V4h/L5T2YxeSYcxAUXdCHe/XNiGHhxIpjBlGT/Z9FmAZFISB0RpQINd6+/r2ioJiNvGSVkp/FBXRFHVjQCxF5Zb4hX5E/BxlFZ9q/KIZN4X1U5XWBR+jaME0eqhBJKIL3m1gbEV5VJlbW3FLT6fqocOiqkfqFkPoTR5iXq5W7I3EarfhNSqKqmpP7I9LNHpGa3IcXF/FU7bBYOqF3h07L9bCSqlHsCioOxHdmKHpV+Yp9NVq7lRXxEn5SdM7hSECTifg4CxLHfkPa4yIJaL27bCbZf9OAqQWJUOHNEzinbBMI3AIRWLRxEYXaX6IJ3YwViFdQpvLHZi3S1q13O1bqrBRFWTFpAKVhA6tNKbODnW76lfGU4uNM4zKEigjNgomsAzjW+C7AQ93COieNiuvL/YtdCq3zlrZDMOoprHIBVWvhWWYwDIqSrG4be4u38kUFZ1bhvfiBGacGV/DqJrNVYFwEp+1kuz3BfQjVp7BBJZRSUFA4L7bRsIElmEY7cWuCKRnuREQneSH0PbOvBgkT9MX6cR4FQZH2XdW5bPXUY+KExwmMFuV6RxqBhGsS6iE9jT25RuqfB0bVhlj2a1BpUHICbBfBZSbwBoX8sFjhG2KhPADc8cAB6xfkf4F0LKRRs63DjPDEP0XVWmX4hReXReqkRniAbSOHo27FxDj2pv+F3g+k37VvHTTgbXXr2PsRFXXIHsKOSmgE8mFIrh9Ns9N8FvWVB1IEG84c9S6xFXJJgq3DIHc0b9tHlHBJdByZr8kDtgbQ2VR1Xmfu5iU+b/sG5bslFvq2rGTN8CYsEJSGivBrq0+NVc7jPMMfFTONQVifGcFGYDnSJN5VH/fNiDgOyT65kHh/ygOmI=";

// Production status display — ใช้ PROD_STATUS ชุดเดียวกับหน้าตารางผลิต
// (key เป็นตัวพิมพ์ใหญ่ตาม ProdStatus จริง: QUEUED/MANUFACTURING/QC/READY)

// Company info — same as quotation print
const COMPANY = {
  name: "บจก. เจอาร์.อลูมิเนียมแอนด์กลาส",
  branch: "สำนักงานใหญ่",
  address: "13 ซ.พุทธบูชา 26/1 บางมด ทุ่งครุ กทม. 10140",
  taxId: "0105560023352",
  phone: "092-254-4765",
  website: "www.jr-aluminium.com",
};

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ProductionPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // 1) Fetch production row + job
  const { data: prod } = await supabase
    .from("productions")
    .select(
      `id, status, planned_install_date, production_queued, production_done,
       producer_note, measure_actual, qc_date,
       job:job_id(id, job_code, customer_name, customer_area, customer_tel)`
    )
    .eq("id", params.id)
    .single();

  if (!prod) notFound();

  // producer_note was added in migration 0022 but not yet reflected in
  // database.types.ts Production interface — cast the row to include it.
  const prodRow = prod as typeof prod & { producer_note: string | null };

  // job is typed as unknown from Supabase generic — cast safely
  const job = prod.job as {
    id: string;
    job_code: string;
    customer_name: string;
    customer_area: string | null;
    customer_tel: string | null;
  } | null;

  const printDate = new Date().toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link
          href={`/production`}
          className="press inline-flex items-center gap-1.5 text-sm text-ink-2"
        >
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* A4 paper */}
      <div
        className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "16mm", boxSizing: "border-box" }}
      >
        {/* ===== Header ===== */}
        <div
          className="flex justify-between items-start pb-4 mb-4"
          style={{ borderBottom: "4px solid #b3151d" }}
        >
          {/* Company block */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_BASE64} alt="JR Aluminium" style={{ height: 22 }} />
            <div className="mt-1 leading-relaxed" style={{ fontSize: 12 }}>
              <span className="font-semibold" style={{ color: "#b3151d" }}>
                {COMPANY.name}
              </span>{" "}
              ({COMPANY.branch})<br />
              {COMPANY.address}<br />
              เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} &middot; โทร.{" "}
              {COMPANY.phone}
              <br />
              {COMPANY.website}
            </div>
          </div>

          {/* Document info */}
          <div className="text-right">
            <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>
              ใบงานผลิต / Work Order
            </div>
            <table className="mt-2 ml-auto" style={{ fontSize: 12 }}>
              <tbody>
                <tr>
                  <td
                    className="text-right pr-3"
                    style={{ color: "#6b7280" }}
                  >
                    เลขที่งาน
                  </td>
                  <td className="font-mono font-semibold">
                    {job?.job_code ?? "—"}
                  </td>
                </tr>
                <tr>
                  <td
                    className="text-right pr-3"
                    style={{ color: "#6b7280" }}
                  >
                    วันที่พิมพ์
                  </td>
                  <td>{printDate}</td>
                </tr>
                <tr>
                  <td
                    className="text-right pr-3"
                    style={{ color: "#6b7280" }}
                  >
                    สถานะ
                  </td>
                  <td>
                    {PROD_STATUS[prodRow.status as keyof typeof PROD_STATUS] ??
                      (prodRow.status as string) ??
                      "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== Job info block ===== */}
        <div
          className="mb-5 p-3 rounded-lg"
          style={{
            border: "1px solid #e5e7eb",
            fontSize: 13,
            background: "#fafafa",
          }}
        >
          <div
            className="font-bold mb-2 pb-1"
            style={{
              color: "#b3151d",
              borderBottom: "1px solid #e5e7eb",
              fontSize: 14,
            }}
          >
            ข้อมูลงาน
          </div>
          <div className="grid gap-y-1" style={{ gridTemplateColumns: "max-content 1fr" }}>
            <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
              ลูกค้า
            </span>
            <span className="font-semibold">
              {job?.customer_name ?? "—"}
            </span>

            {job?.customer_area && (
              <>
                <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
                  พื้นที่
                </span>
                <span>{job.customer_area}</span>
              </>
            )}

            {job?.customer_tel && (
              <>
                <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
                  เบอร์โทร
                </span>
                <span className="tabular-nums">{job.customer_tel}</span>
              </>
            )}

            <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
              วันผลิต
            </span>
            <span className="tabular-nums">
              {prodRow.production_done
                ? fmt(prodRow.production_done as string)
                : prodRow.production_queued
                ? fmt(prodRow.production_queued as string) + " (คิว)"
                : "—"}
            </span>

            <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
              วัดจริง
            </span>
            <span className="tabular-nums">
              {fmt(prodRow.measure_actual as string | null)}
            </span>

            {prodRow.qc_date && (
              <>
                <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
                  QC
                </span>
                <span className="tabular-nums">
                  {fmt(prodRow.qc_date as string)}
                </span>
              </>
            )}

            {prodRow.producer_note && (
              <>
                <span className="pr-4 font-medium" style={{ color: "#6b7280" }}>
                  หมายเหตุช่างผลิต
                </span>
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {prodRow.producer_note}
                </span>
              </>
            )}
          </div>

          {/* วันติดตั้ง — แสดงเด่นๆ */}
          <div
            className="mt-3 pt-3 flex items-center gap-3"
            style={{ borderTop: "1px solid #e5e7eb" }}
          >
            <span className="font-bold" style={{ fontSize: 13, color: "#6b7280" }}>
              วันติดตั้ง
            </span>
            <span
              className="font-bold tabular-nums"
              style={{
                fontSize: 16,
                color: prodRow.planned_install_date ? "#7d0f15" : "#6b7280",
              }}
            >
              {fmt(prodRow.planned_install_date as string | null)}
            </span>
          </div>
        </div>

        {/* ===== Spacer to push signature block toward bottom ===== */}
        <div style={{ minHeight: 40 }} />

        {/* ===== Signature / site-note block ===== */}
        <div
          className="mt-6"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "14px 16px",
            fontSize: 12,
          }}
        >
          <div
            className="font-bold mb-3"
            style={{ color: "#374151", fontSize: 13 }}
          >
            หมายเหตุหน้างาน / บันทึกช่างติดตั้ง
          </div>
          {/* note lines */}
          <div style={{ lineHeight: "2.4", color: "#d1d5db" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{ borderBottom: "1px solid #d1d5db", marginBottom: 0 }}
              >
                &nbsp;
              </div>
            ))}
          </div>

          {/* signature row */}
          <div className="flex justify-between mt-5" style={{ gap: 20 }}>
            {/* installer sign */}
            <div className="flex-1 text-center">
              <div
                style={{
                  borderBottom: "1px solid #374151",
                  height: 36,
                  marginBottom: 4,
                }}
              />
              <div style={{ color: "#6b7280" }}>ช่างผู้ติดตั้ง</div>
              <div style={{ color: "#9ca3af", marginTop: 2 }}>
                วันที่ ........../........../..........
              </div>
            </div>

            {/* customer sign */}
            <div className="flex-1 text-center">
              <div
                style={{
                  borderBottom: "1px solid #374151",
                  height: 36,
                  marginBottom: 4,
                }}
              />
              <div style={{ color: "#6b7280" }}>ลูกค้า / ผู้รับมอบงาน</div>
              <div style={{ color: "#9ca3af", marginTop: 2 }}>
                วันที่ ........../........../..........
              </div>
            </div>

            {/* supervisor sign */}
            <div className="flex-1 text-center">
              <div
                style={{
                  borderBottom: "1px solid #374151",
                  height: 36,
                  marginBottom: 4,
                }}
              />
              <div style={{ color: "#6b7280" }}>หัวหน้างาน / ตรวจสอบ</div>
              <div style={{ color: "#9ca3af", marginTop: 2 }}>
                วันที่ ........../........../..........
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
